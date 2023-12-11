// iotEvent-handler
const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;
const COL_FACE_IMG_URL = process.env.COL_FACE_IMG_URL;

const ACTION_UPDATE = 'UPDATE';
const ACTION_REMOVE = 'REMOVE';

const storage = require('../api/storage');
const iot = require('../api/iot');
const scanner = require('../api/scanner');

exports.handler = async function(event) {

	console.log('iotEventHandler.handler in: event:' + JSON.stringify(event));

    const getShadowResult = await iot.getShadow({
        thingName: AWS_IOT_THING_NAME
    });

    if (!event) {
    	event = { state : {} };
    	if (getShadowResult.state.delta) {
    		event.state = getShadowResult.state.delta;	
    	}
    }

    console.log('iotEventHandler.handler current event:' + JSON.stringify(event));

	if (getShadowResult.state.desired.hostId) {
		process.env.HOST_ID = getShadowResult.state.desired.hostId;
		await storage.updateHost(getShadowResult.state.desired.hostId).catch(err => {
			console.error('updateHost error' + JSON.stringify(err));
		});

		if (event.state.listings) {
			await Promise.allSettled(
				Object.entries(getShadowResult.state.desired.listings).filter(([listingId, {action, internalName}]) => {
			        return Object.keys(event.state.listings).includes(listingId);
			    }).map(async ([listingId, {action, internalName}]) => {
					if (action == ACTION_UPDATE) {
						await updateListing({listingId, hostId: getShadowResult.state.desired.hostId, internalName});
					} else if (action == ACTION_REMOVE) {
						await deleteListing({listingId, hostId: getShadowResult.state.desired.hostId});

						//TODO report iot to clear listing in shadow
					} else {
						throw new Error(`Wrong listing action ${action}!`);
					}
		    	
			}));
		}

	}

    if (!event.state.reservations) {

        console.log('reservations not specified in delta!!');

	    await iot.updateReportedShadow({
	        thingName: AWS_IOT_THING_NAME,
	        reportedState: getShadowResult.state.desired
	    });

    } else {

    	const syncResults = await Promise.allSettled(
	    	Object.entries(getShadowResult.state.desired.reservations).filter(([reservationCode, {listingId, lastRequestOn, action}]) => {
	            return Object.keys(event.state.reservations).includes(reservationCode);
	        }).map(async ([reservationCode, {listingId, lastRequestOn, action}]) => {
	            if (action == ACTION_REMOVE) {
	                const syncResult = await removeReservation({
	                    reservationCode,
	                    listingId,
	                    lastRequestOn
	                }).catch(err => {
	           			console.log('removeReservation err:' + JSON.stringify(err));

	           			return {
	           				rejectReason: err.message
	           			}
	                });

			        await iot.publish({
			            topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/reservation_reset`,
			            payload: JSON.stringify({
			                listingId: listingId,
			                reservationCode: reservationCode,
			                lastResponse: lastRequestOn,
			                rejectReason: syncResult.rejectReason,
			                clearRequest: (syncResult.rejectReason ? false : syncResult.clearRequest)
			            })
			        });

			        if (syncResult.rejectReason) {
			        	throw new Error(syncResult.rejectReason);	
			        }

			        return;

	            } else if (action == ACTION_UPDATE) {
	                const syncResult = await syncReservation({
	                    reservationCode,
	                    listingId,
	                    lastRequestOn
	                }).catch(err => {

	           			console.log('iotEventHandler.syncReservation err:' + JSON.stringify(err));

	           			return {
	           				rejectReason: err.message
	           			}
	                });

			        await iot.publish({
			            topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/reservation_deployed`,
			            payload: JSON.stringify({
			                listingId: listingId,
			                reservationCode: reservationCode,
			                lastResponse: lastRequestOn,
			                rejectReason: syncResult.rejectReason
			            })
			        });

			        if (syncResult.rejectReason) {
			        	throw new Error(syncResult.rejectReason);	
			        }

			        return;

	            } else {
			        await iot.publish({
			            topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/reservation_deployed`,
			            payload: JSON.stringify({
			                listingId: listingId,
			                reservationCode: reservationCode,
			                lastResponse: lastRequestOn,
			                rejectReason: `Wrong action ${action}!`
			            })
			        });

	                throw new Error(`Wrong reservation action ${action}!`);
	            }
	    }));

	    console.log('syncResults:' + JSON.stringify(syncResults));

	    if (syncResults.every(syncResult => {
	    	return (syncResult.status == 'fulfilled')
	    })) {
		    await iot.updateReportedShadow({
		        thingName: AWS_IOT_THING_NAME,
		        reportedState: getShadowResult.state.desired
		    });    	
	    }
    }

    console.log('iotEventHandler.handler out');
};

const removeReservation = async ({reservationCode, listingId, lastRequestOn}) => {

	console.log('iotEventHandler.removeReservation in: ' + JSON.stringify({reservationCode, listingId, lastRequestOn}));

	// const getShadowResult = await iot.getShadow({
	//     thingName: AWS_IOT_THING_NAME,
	//     shadowName: reservationCode
	// });

	const getShadowResult = await iot.getShadow({
	    thingName: AWS_IOT_THING_NAME,
	    shadowName: reservationCode
	}).catch(err => {
		console.log('removeReservation getShadow err:' + JSON.stringify(err));
		return;
	});

	if (getShadowResult) {
		if (!getShadowResult.state.desired ||
			!getShadowResult.state.desired.lastRequestOn ||
			getShadowResult.state.desired.lastRequestOn != lastRequestOn) {

			throw new Error('Request of RemoveReservation datetime validation error!');
		}
	}
	
	const userResults = await scanner.findUsers({
	    listingId: listingId,
	    group: reservationCode
	});

	// delete users at scanners
	const deleteResponse = await Promise.all(userResults.map(async({scannerAddress, users}) =>{
		return await scanner.deleteUsers({
			scannerAddress: scannerAddress, 
			deleteUsersParam: users
		});
	}));

	const deleteResults = deleteResponse.flatMap(x => x);

	console.log('iotEventHandler.removeReservation deleteResults: ' + JSON.stringify(deleteResults));


    // update local ddb
    const getReservationResult = await storage.getReservation({reservationCode, listingId});

    await storage.deleteReservation({
    	listingId: listingId,
    	reservationCode: reservationCode
    });

    if (getReservationResult && getReservationResult.members) {
    	await storage.deleteMembers(getReservationResult.members);	
    }

    // delete named shadow
    // await iot.deleteShadow({
    // 	thingName: AWS_IOT_THING_NAME,
    // 	shadowName: reservationCode    	
    // });

    await iot.deleteShadow({
    	thingName: AWS_IOT_THING_NAME,
    	shadowName: reservationCode    	
    }).catch(err => {
		console.log('removeReservation deleteShadow err:' + JSON.stringify(err));
		return;
	});

	console.log('iotEventHandler.removeReservation deleteResults:' + JSON.stringify(deleteResults));

	console.log('iotEventHandler.removeReservation out:' + JSON.stringify({reservationCode, listingId, lastRequestOn, clearRequest: true}));

	return {reservationCode, listingId, lastRequestOn, clearRequest: true};
	
}

const syncReservation = async ({reservationCode, listingId, lastRequestOn}) => {

	console.log('iotEventHandler.syncReservation in: ' + JSON.stringify({reservationCode, listingId, lastRequestOn}));

	const getShadowResult = await iot.getShadow({
	    thingName: AWS_IOT_THING_NAME,
	    shadowName: reservationCode
	});

	if (!getShadowResult.state.desired ||
		!getShadowResult.state.desired.lastRequestOn ||
		getShadowResult.state.desired.lastRequestOn != lastRequestOn) {

		throw new Error('Request of SyncReservation datetime validation error!');
	}

    let reportedMembers = new Map();
    if (getShadowResult.state.reported) {
		if (getShadowResult.state.reported.members) {
			reportedMembers = new Map(Object.entries(getShadowResult.state.reported.members));	
		}
    }

    let desiredMembers = new Map();
    if (getShadowResult.state.desired) {
		if (getShadowResult.state.desired.members) {
			desiredMembers = new Map(Object.entries(getShadowResult.state.desired.members));	
		}
    }

	let deltaMembers = new Map();
	if (getShadowResult.state.delta) {
		if (getShadowResult.state.delta.members) {
			deltaMembers = new Map(Object.entries(getShadowResult.state.delta.members));	
		}
	}
	
	// let listingId = getShadowResult.state.desired.reservation.listingId;

	const toDeleteMembers = new Map();
	reportedMembers.forEach((value, key) => {
  		if (!desiredMembers.has(key)) {
  			toDeleteMembers.set(key, value);
  		}
	});

	// delete users on scanner
	const scannerDeletePromises = [];

	toDeleteMembers.forEach(async (member) => {
		scannerDeletePromises.push(scanner.deleteUser({
			listingId: listingId,
			userParam: member
		}));
	});

	const scannerDeleteResponse = await Promise.all(scannerDeletePromises);

	const scannerDeleteResults = scannerDeleteResponse.flatMap(x => x);

	console.log('iotEventHandler.syncReservation scannerDeleteResults: ' + JSON.stringify(scannerDeleteResults));

	// add/update users to scanner
	const scannerUpdatePromises = [];

	deltaMembers.forEach(async (value, key) => {
		console.log('deltaMembers value:' + JSON.stringify(value));
		console.log('deltaMembers key:' + key);

		const userParam = desiredMembers.get(key);
		if (!value.hasOwnProperty(COL_FACE_IMG_URL)) {
			delete userParam[COL_FACE_IMG_URL];
		}

		scannerUpdatePromises.push(scanner.addUser({
			reservation: getShadowResult.state.desired.reservation,
			userParam: userParam
		}));
	});

	const scannerUpdateResponse = await Promise.all(scannerUpdatePromises);

	const scannerUpdateResults = scannerUpdateResponse.flatMap(x => x);

	console.log('iotEventHandler.syncReservation scannerUpdateResults: ' + JSON.stringify(scannerUpdateResults));

    // update local ddb
    await storage.deleteMembers(Array.from(toDeleteMembers.values()));

    await storage.saveReservation({
        reservation: getShadowResult.state.desired.reservation,
        members: Array.from(desiredMembers.values())
    });

	// update shadow
	const reportedState = Object.assign({}, getShadowResult.state.delta);

	toDeleteMembers.forEach((value, key) => {
		if (!reportedState['members']){
			reportedState['members'] ={};
		}
		reportedState['members'][key] = null;
	});

    await iot.updateReportedShadow({
    	thingName: AWS_IOT_THING_NAME,
    	shadowName: reservationCode,
    	reportedState: reportedState
    });

	console.log('iotEventHandler.syncReservation out:' + JSON.stringify({reservationCode, listingId, lastRequestOn}));

	return {reservationCode, listingId, lastRequestOn};

};

const updateListing = async ({hostId, listingId, internalName}) => {

	console.log('iotEventHandler.updateListing in: ' + JSON.stringify({hostId, listingId, internalName}));

    // update local ddb
    await storage.updateListing({
    	hostId: hostId,
    	listingId: listingId,
    	internalName: internalName
    });

	console.log('iotEventHandler.updateListing out');
	
}

const deleteListing = async ({hostId, listingId}) => {

	console.log('iotEventHandler.deleteListing in: ' + JSON.stringify({hostId, listingId}));

    // update local ddb
    await storage.deleteListing({
    	hostId: hostId,
    	listingId: listingId
    });

	console.log('iotEventHandler.deleteListing out');
	
}
