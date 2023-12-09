const iot = require('../api/iot');
const scanner = require('../api/scanner');
const storage = require('../api/storage');

const Router = require('express-promise-router');

const router = new Router();

// export our router to be mounted by the parent application
module.exports = router;

router.post('/deviceReg', async (req, res) => {

  console.log('routes.deviceReg in: req.ip:' + JSON.stringify(req.ip));
  console.log('routes.deviceReg in: req.body:' + JSON.stringify(req.body));

  const scannerConfig = await scanner.getConfig(req.ip);
  const companyName = scannerConfig.companyName;

  const listingIds = req.body.listingId.split(',');

  let response = {
    'code': 0,
    'message': 'Good' 
  };

  let params = [];
  if (listingIds.length <= 0) {
    response = {
      'code': 1,
      'message': 'Please set listingId to <listingId1> or <listingId1>,<listingId2>!!'
    };
    
    return res.send(response);

  } else {
    listingIds.forEach(listingId => {

      let roomCodes;
      if (req.body.roomCode) {
        roomCodes = JSON.parse(req.body.roomCode)[listingId];
      }

      if (roomCodes && roomCodes.length > 0) {
        roomCodes.forEach(roomCode => {
          params.push({
            listingId: listingId,
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
          terminalKey: req.body.terminalKey,
          terminalName: req.body.terminalName,
          coreName: process.env.AWS_IOT_THING_NAME,
          localIp: req.body.localIp,
          latitude: req.body.latitude,
          longitude: req.body.longitude
        });        
      }
    });
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

