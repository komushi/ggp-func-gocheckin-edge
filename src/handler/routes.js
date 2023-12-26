const iot = require('../api/iot');
const scanner = require('../api/scanner');
const storage = require('../api/storage');

const Router = require('express-promise-router');

const router = new Router();

// export our router to be mounted by the parent application
module.exports = router;

router.post('/deviceReg', async (req, res) => {

  console.log('routes.deviceReg in: req.body:' + JSON.stringify(req.body));
  console.log('routes.deviceReg in HOST_ID:' + process.env.HOST_ID);
  console.log('routes.deviceReg in PROPERTY_CODE:' + process.env.PROPERTY_CODE);

  if (!process.env.HOST_ID || !process.env.PROPERTY_CODE) {
    return {
      'code': 1
    }
  }

  //TODO validate listings by internalName
  let response = {
    'code': 0,
    'message': 'Good' 
  };

  const roomCodes = req.body.roomCode.split(',');

  if (roomCodes.length == 0) {
    response = {
      'code': 1,
      'message': 'Set the roomCodes to <internalName1>,<internalName2>'
    };
    
    return res.send(response);
  }

  const params = roomCodes.map(roomCode => {
    return {
      hostId: process.env.HOST_ID,
      propertyCode: process.env.PROPERTY_CODE,
      equipmentId: req.body.terminalKey,
      equipmentName: req.body.terminalName,
      coreName: process.env.AWS_IOT_THING_NAME,
      localIp: req.body.localIp,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      roomCode: roomCode
    };
  });

  console.log('routes.deviceReg params:' + JSON.stringify(params));

  const scannerResults = await storage.updateScanners(params, req.body.terminalKey);

  const publishResults = await iot.publish({
    topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/scanner_detected`,
    payload: JSON.stringify({
      items: scannerResults,
      equipmentId: req.body.terminalKey
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

  console.log('routes.uploadMipsGateRecord in HOST_ID:' + process.env.HOST_ID);

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

