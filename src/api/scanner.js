const SCANNER_PORT = process.env.SCANNER_PORT;
const COL_FACE_IMG_URL = process.env.COL_FACE_IMG_URL;

const USER_DELETE_API = 'service2dev/api/userDelete';
const USER_ADD_API = 'service2dev/api/userFaceAdd';
const USER_FIND_API = 'service2dev/api/findUser';

const got = require('got');
const FormData = require('form-data');

const storage = require('../api/storage');

module.exports.getScanners = async ({listingId}) => {
  console.log('scanner.getScanners in: ' + JSON.stringify({listingId}));

  let scannerAddresses = [];

  if (listingId) {
    scannerAddresses = await storage.getScanners({
      listingId: listingId
    });    
  } else {
    scannerAddresses = await storage.getScanners({});
  }

  console.log('scanner.getScanners out: results:' + JSON.stringify(scannerAddresses));

  return scannerAddresses;
};

module.exports.findUsers = async ({listingId, userName, userCode, group}) => {
  console.log('scanner.findUsers in: ' + JSON.stringify({listingId, userName, userCode, group}));

  let scannerAddresses = [];

  if (listingId) {
    scannerAddresses = await storage.getScanners({
      listingId: listingId
    });    
  } else {
    scannerAddresses = await storage.getScanners({});
  }

  console.log('scanner.findUsers scannerAddresses:' + JSON.stringify(scannerAddresses));

  // if (scannerAddresses.length == 0) {
  //   throw new Error('No Scanner Addresses found!!');
  // }

  if (scannerAddresses.length == 0) {
    console.log('scanner.findUsers out: results: []');
    return [];
  }

  const bodyFormData = new FormData();
  if (userName) {
    bodyFormData.append('name', userName);
  } else if (userCode) {
    bodyFormData.append('name', userCode);  
  } else if (group) {
    bodyFormData.append('name', group);  
  } else {
    throw new Error('scanner.findUsers - Need userName, userCode or group to find a user');
  }
  
  const results = await Promise.all(scannerAddresses.map(async (scannerAddress) => {
    
    // console.log('findUsers url:' + `http://${scannerAddress}:${SCANNER_PORT}/${USER_FIND_API}`);
    // console.log('findUsers bodyFormData:' + JSON.stringify(bodyFormData));

    const response = await got.post(`http://${scannerAddress}:${SCANNER_PORT}/${USER_FIND_API}`, {
      body: bodyFormData
    });

    console.log(response);

    let users = [];

    if (response) {
      if (response.body) {
        if ((JSON.parse(response.body)).data) {
          users = (JSON.parse(response.body)).data;
        }
      }
    }

    return {
      scannerAddress: scannerAddress,
      users: users
    };

  }));

  console.log('scanner.findUsers out: results:' + JSON.stringify(results));

  return results;
};

module.exports.deleteUsers = async ({scannerAddress, deleteUsersParam}) => {
  console.log('deleteUsers in: scannerAddress:' + scannerAddress);
  console.log('deleteUsers in: deleteUsersParam:' + JSON.stringify(deleteUsersParam));

  const userCodes = deleteUsersParam.map(member => {
    return member.userCode + '#_';
  }).join('');

  console.log('scanner.deleteUsers userCodes:' + userCodes);

  const bodyFormData = new FormData();
  bodyFormData.append('userCode', userCodes);

  // console.log('deleteUsers bodyFormData:' + JSON.stringify(bodyFormData));

  const response = await got.post(`http://${scannerAddress}:${SCANNER_PORT}/${USER_DELETE_API}`, {
    body: bodyFormData
  });

  const result = JSON.parse(response.body);

  console.log('scanner.deleteUsers result:' + result);

  if (result.code == 1) {
    throw new Error(result.message);
  }
  
  console.log('scanner.deleteUsers out: result:' + result);

  return result;

};

module.exports.deleteUser = async ({listingId, userParam}) => {
  console.log('deleteUser in: listingId:' + listingId);
  console.log('deleteUser in: userParam:' + JSON.stringify(userParam));

  const scannerAddresses = await storage.getScanners({
    listingId: listingId, 
    roomCode: userParam.roomCode
  });

  // console.log('deleteUser scannerAddresses:' + JSON.stringify(scannerAddresses));
  if (scannerAddresses.length == 0) {
    throw new Error('No Scanner Addresses found!!');
  }

  const userCode = `${userParam.reservationCode}-${userParam.memberNo}#_`;

  console.log('deleteUser userCode:' + userCode);

  const bodyFormData = new FormData();
  bodyFormData.append('userCode', userCode);

  const results = await Promise.allSettled(scannerAddresses.map(async (scannerAddress) => {
    
    console.log('deleteUser url:' + `http://${scannerAddress}:${SCANNER_PORT}/${USER_DELETE_API}`);
    console.log('deleteUser bodyFormData:' + JSON.stringify(bodyFormData));

    const response = await got.post(`http://${scannerAddress}:${SCANNER_PORT}/${USER_DELETE_API}`, {
      body: bodyFormData
    });

    return JSON.parse(response.body);

  }));

  results.filter(result => {
    console.log('scanner.deleteUser scanner API:', result);
    
    if (result.code != 0) {
      return true;
    }
  }).map(result => {
    throw new Error(`${result.userCode}: ${result.message}`);
  });

  console.log('scanner.deleteUser out: results:' + JSON.stringify(results));

  return results;
};

module.exports.addUser = async ({reservation, userParam}) => {
  console.log('scanner.addUser in:' + JSON.stringify({reservation, userParam}));

  const scannerAddresses = await storage.getScanners({
    listingId: reservation.listingId, 
    roomCode: userParam.roomCode
  });

  if (scannerAddresses.length == 0) {
    throw new Error('No Scanner Addresses found!!');
  }  

  const bodyFormData = new FormData();
  if (userParam[COL_FACE_IMG_URL]) {
    bodyFormData.append('imgUrl', userParam[COL_FACE_IMG_URL]);
  }
  bodyFormData.append('userName', userParam.fullName);
  bodyFormData.append('type', 1);
  bodyFormData.append('userCode', `${userParam.reservationCode}-${userParam.memberNo}`);
  bodyFormData.append('group', `${userParam.reservationCode}`);
  bodyFormData.append('memberId', `${userParam.memberNo}`);
  bodyFormData.append('beginDate', `${reservation.checkInDate} 14:00`);
  bodyFormData.append('endDate', `${reservation.checkOutDate} 11:00`);

  const results = await Promise.all(scannerAddresses.map(async (scannerAddress) => {

    console.log('scanner.addUser url:' + `http://${scannerAddress}:${SCANNER_PORT}/${USER_ADD_API}`);
    console.log('scanner.addUser bodyFormData:' + JSON.stringify(bodyFormData));

    const response = await got.post(`http://${scannerAddress}:${SCANNER_PORT}/${USER_ADD_API}`, {
      body: bodyFormData
    }).catch(err => {
      console.log('scanner.addUser err:' + err);
      throw err;
    });

    console.log('scanner.addUser response!!');
    console.log(response);
    console.log('scanner.addUser response!!');

    return JSON.parse(response.body);

  }));

  results.filter(result => {
    console.log('scanner.addUser scanner API:', result);
    if (result.code != 0) {
      return true;
    }
  }).map(result => {
    console.log('scanner.addUser out result:' + JSON.stringify(result));
    throw new Error(`${result.userCode}: ${result.message}`);
  });

  console.log('scanner.addUser out: results:' + JSON.stringify(results));

  return results;
};
