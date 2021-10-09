const greengrass = require('aws-greengrass-core-sdk');
const iotData = new greengrass.IotData();
const { IoTDataPlaneClient, GetThingShadowCommand, UpdateThingShadowCommand, DeleteThingShadowCommand } = require("@aws-sdk/client-iot-data-plane");

module.exports.publish = async ({topic, payload}) => {

	console.log('iot-api.publish in: ' + JSON.stringify({topic, payload}));

    return new Promise((resolve, reject) => {
      iotData.publish({
        topic: topic,
        payload: payload
      }, (err, data) =>{
        if (err) {
        	console.log('iot-api.publish err:' + JSON.stringify(err));
          	reject(err);
        } else {
        	console.log('iot-api.publish out data:' + JSON.stringify(data));
      		resolve(data);
        }
      });
    });

};

module.exports.getShadow = async (params) => {

	console.log('iot-api.getShadow in: params:' + JSON.stringify(params));

	const client = new IoTDataPlaneClient({});

	const command = new GetThingShadowCommand(params);

	const objResult = await client.send(command);

	let result = {};
	if (objResult) {
		const returnArray = Object.values(objResult.payload);

		result = JSON.parse(String.fromCharCode.apply(null, new Uint8Array(returnArray)));
	}

	console.log('iot-api.getShadow out: result:' + JSON.stringify(result));

	return result;

};

module.exports.updateReportedShadow = async ({thingName, shadowName, reportedState}) => {

	console.log('iot-api.updateReportedShadow in:' + JSON.stringify({thingName, shadowName, reportedState}));

	let newParams = {
		thingName: thingName
	}

	if (shadowName) {
		newParams.shadowName = shadowName;
	}

	if (reportedState) {
		newParams.payload = Buffer.from(JSON.stringify({
            "state": {
                "reported": reportedState
            }
		}));
	}

	const result = await updateShadow(newParams);

	console.log('iot-api.updateReportedShadow out: result:' + JSON.stringify({result}));
};


module.exports.deleteShadow = async ({thingName, shadowName}) => {

	console.log('iot-api.deleteShadow in:' + JSON.stringify({thingName, shadowName}));

	if (!thingName || !shadowName) {
		throw new Error('Both thingName and shadowName are needed to DeleteThingShadow!!');
	}

	const client = new IoTDataPlaneClient({});

	const command = new DeleteThingShadowCommand({thingName, shadowName});

	const objResult = await client.send(command);

	let result = {};
	if (objResult) {
		const returnArray = Object.values(objResult.payload);

		result = JSON.parse(String.fromCharCode.apply(null, new Uint8Array(returnArray)));
	}

	console.log('iot-api.deleteShadow out: result:' + JSON.stringify(result));

	return result;

};

const updateShadow = async ({thingName, shadowName, payload}) => {

	console.log('iot-api.updateShadow in: ' + JSON.stringify({thingName, shadowName, payload}));

	const client = new IoTDataPlaneClient({});

	const command = new UpdateThingShadowCommand({thingName, shadowName, payload});

	const objResult = await client.send(command);

	let result = {};
	if (objResult) {
		const returnArray = Object.values(objResult.payload);

		result = JSON.parse(String.fromCharCode.apply(null, new Uint8Array(returnArray)));
	}

	console.log('iot-api.updateShadow out: result:' + JSON.stringify(result));

	return result;
};
