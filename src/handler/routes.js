const iot = require('../api/iot');
const storage = require('../api/storage');

const Router = require('express-promise-router');

const ShortUniqueId = require('short-unique-id');

const router = new Router();
const uid = new ShortUniqueId();

// export our router to be mounted by the parent application
module.exports = router;

router.post('/deviceReg', async (req, res) => {

  console.log('routes.deviceReg in: req.body:' + JSON.stringify(req.body));

  const listingIds = req.body.listingId.split(',');

  let response = {
    'code': 0,
    'message': 'Good' 
  };

  let params = [];

  if (listingIds.length == 0) {
    response = {
      'code': 1,
      'message': 'Please set listingId to <listingId1> or <listingId1>,<listingId2>!!'
    };
    
    return res.send(response);

  } else if (listingIds.length == 1) {

    res.send(response);

    params.push({
      listingId: req.body.listingId,
      terminalKey: req.body.terminalKey,
      terminalName: req.body.terminalName,
      coreName: process.env.AWS_IOT_THING_NAME,
      localIp: req.body.localIp,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      roomCode: req.body.roomCode
    });

  } else if (listingIds.length > 1) {

    if (req.body.roomCode) {
      response = {
        'code': 1,
        'message': 'Cannot set roomCode with multiple listings!!'
      };

      return res.send(response);
    } else {
      res.send(response);

      listingIds.forEach(listingId => {
        params.push({
          uuid: uid.randomUUID(6),
          listingId: listingId,
          terminalKey: req.body.terminalKey,
          terminalName: req.body.terminalName,
          coreName: process.env.AWS_IOT_THING_NAME,
          localIp: req.body.localIp,
          latitude: req.body.latitude,
          longitude: req.body.longitude
        });
      });
    }
  }

  const scannerResults = await storage.updateScanners(params);

  const publishResults = await iot.publish({
    topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/scanner_detected`,
    payload: JSON.stringify({
      items: scannerResults,
      terminalKey: req.body.terminalKey
    })
  });

  console.log('routes.deviceReg out: publishResults:' + JSON.stringify(publishResults));

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

