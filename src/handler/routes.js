const iot = require('../api/iot');
const scanner = require('../api/scanner');
const storage = require('../api/storage');

const Router = require('express-promise-router');

const router = new Router();

// export our router to be mounted by the parent application
module.exports = router;

router.post('/deviceReg', async (req, res) => {

  // console.log('routes.deviceReg in: req.ip:' + JSON.stringify(req.ip));
  console.log('routes.deviceReg in: req.body:' + JSON.stringify(req.body));

/*
  let localIp = req.ip;

  if (localIp.substr(0, 7) == "::ffff:") {
    localIp = localIp.substr(7);
  };

  const scannerConfig = await scanner.getConfig(localIp);
  const companyName = scannerConfig.companyName;

  console.log('routes.deviceReg companyName:' + companyName);
*/

  //TODO validate listings by internalName

  const internalNames = req.body.listingId.split(',');

  let response = {
    'code': 0,
    'message': 'Good' 
  };

  let params = [];
  let roomCodeObj = {};
  if (internalNames.length == 0) {
    response = {
      'code': 1,
      'message': 'Set the listings to <internalName1>,<internalName2>!'
    };
    
    return res.send(response);

  } else {

    listingRoomCodes = req.body.roomCode.split(',');

    listingRoomCodes.forEach(listingRoomCode => {
      const listingRoomCodeSplit = listingRoomCode.split('-');
      if (listingRoomCodeSplit.length != 2) {
        response = {
          'code': 1,
          'message': 'Set the roomCodes to <internalName1-room1>,<internalName2-room2>..!'
        };

        return res.send(response);
      }

      const crtInternalName = listingRoomCodeSplit[0];
      const crtRoomCode = listingRoomCodeSplit[1];

      if (internalNames.includes(crtInternalName)) {
        if (roomCodeObj[crtInternalName]) {
          roomCodeObj[crtInternalName].push(crtRoomCode);
        } else {
          roomCodeObj[crtInternalName] = [crtRoomCode];
        }

      } else {
        response = {
          'code': 1,
          'message': 'The internalName in roomCodes need to match the listings!!'
        };

        return res.send(response);
      }

    });

    console.log('routes.deviceReg roomCodeObj:' + JSON.stringify(roomCodeObj));

    params = internalNames.reduce(async (acc, internalName) => {
      const listing = await storage.getListing(internalName);

      let listingId;
      if (!listing) {
        acc.push({
          // error: 'The internalName ' + internalName + ' does not exist!!'
          error: internalName
        });

        return acc;
      } else {
        listingId = listing.listingId;
      }

      const roomCodes = roomCodeObj[internalName];

      if (roomCodes && roomCodes.length > 0) {
        roomCodes.forEach(roomCode => {
          acc.push({
            listingId: listingId,
            hostId: process.env.HOST_ID,
            terminalKey: req.body.terminalKey,
            terminalName: req.body.terminalName,
            coreName: process.env.AWS_IOT_THING_NAME,
            localIp: req.body.localIp,
            latitude: req.body.latitude,
            longitude: req.body.longitude,
            roomCode: roomCode
          });
        })
      } else {
        acc.push({
          listingId: listingId,
          hostId: process.env.HOST_ID,
          terminalKey: req.body.terminalKey,
          terminalName: req.body.terminalName,
          coreName: process.env.AWS_IOT_THING_NAME,
          localIp: req.body.localIp,
          latitude: req.body.latitude,
          longitude: req.body.longitude
        });        
      }

      return acc;
    }, []);
/*
    internalNames.forEach(async (internalName) => {
      const listing = await storage.getListing(internalName);

      let listingId;
      if (!listing) {
        params.push({
          // error: 'The internalName ' + internalName + ' does not exist!!'
          error: internalName
        });

        return;
      } else {
        listingId = listing.listingId;
      }

      const roomCodes = roomCodeObj[internalName];

      if (roomCodes && roomCodes.length > 0) {
        roomCodes.forEach(roomCode => {
          params.push({
            listingId: listingId,
            hostId: process.env.HOST_ID,
            terminalKey: req.body.terminalKey,
            terminalName: req.body.terminalName,
            coreName: process.env.AWS_IOT_THING_NAME,
            localIp: req.body.localIp,
            latitude: req.body.latitude,
            longitude: req.body.longitude,
            roomCode: roomCode
          });
        })
      } else {
        params.push({
          listingId: listingId,
          hostId: process.env.HOST_ID,
          terminalKey: req.body.terminalKey,
          terminalName: req.body.terminalName,
          coreName: process.env.AWS_IOT_THING_NAME,
          localIp: req.body.localIp,
          latitude: req.body.latitude,
          longitude: req.body.longitude
        });        
      }
    });
*/    
  }

  console.log('routes.deviceReg params:' + JSON.stringify(params));

  let initialValue;
  const errors = params.filter(param => {
    return 'error' in param;
  }).reduce(
    (accumulator, currentValue) => accumulator + ',' + currentValue,
    initialValue,
  );

  if (errors) {
    response = {
      'code': 1,
      'message': 'The internalName ' + errors + ' do not exist!!'
    };

    return res.send(response);
  }

  const scannerResults = await storage.updateScanners(params, req.body.terminalKey);

  const publishResults = await iot.publish({
    topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/scanner_detected`,
    payload: JSON.stringify({
      items: scannerResults,
      terminalKey: req.body.terminalKey
    })
  });

  console.log('routes.deviceReg out: publishResults:' + JSON.stringify(publishResults));

  return res.send(response);
});

router.post('/uploadMipsGateRecord', async (req, res) => {

  const payload = req.body

  payload.eventTimestamp = Date.now();
  delete payload.checkPic;

  console.log('routes.uploadMipsGateRecord in: payload:' + JSON.stringify(payload));

  if (payload.type == 1 || payload.type == 2) {
    const getMemberResult = await storage.getMember({
      reservationCode: payload.group,
      memberNo: payload.memberId
    });

    if (!getMemberResult) {
      res.send({
          "code":0,
          "message": 'Member info not found!'
      });

      return;
    }

    let message = `${payload.userName} `;

    if (getMemberResult.roomCode) {
       message += `Room: ${getMemberResult.roomCode} `;
    }

    if (getMemberResult.keyInfo) {
       message += `Key: ${getMemberResult.keyInfo}`;
    }

    res.send({
        "code":0,
        "message": message
    });

  } else {
    res.send({
        "code":0,
        "message": `payload.type ${payload.type} Not allowed!`

    });
  }

  // await storage.saveScanRecord(payload);

  const iotPayload = {
    reservationCode: payload.group,
    terminalKey: payload.terminalKey,
    hostId: process.env.HOST_ID,
    temperature: payload.temperature,
    mask: payload.temperature,
    userName: payload.userName,
    recordTime: (new Date(payload.eventTimestamp)).toISOString()
  }


  const publishResults = await iot.publish({
    topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/scan_record`,
    payload: JSON.stringify(iotPayload)
  });

  console.log('routes.uploadMipsGateRecord out:');
});

