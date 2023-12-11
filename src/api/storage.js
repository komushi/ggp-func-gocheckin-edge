const TBL_RESERVATION = process.env.TBL_RESERVATION;
const TBL_MEMBER = process.env.TBL_MEMBER;
const TBL_SCANNER = process.env.TBL_SCANNER;
const IDX_LISTINGID_ROOMCODE = process.env.IDX_LISTINGID_ROOMCODE;
const IDX_LISTINGID_TERMINALKEY = process.env.IDX_LISTINGID_TERMINALKEY;
const IDX_TERMINALKEY = process.env.IDX_TERMINALKEY;
const TBL_RECORD = process.env.TBL_RECORD;
const TBL_LISTING = process.env.TBL_LISTING;
const IDX_INTERNALNAME = process.env.IDX_INTERNALNAME;
const TBL_HOST = process.env.TBL_HOST;

const config = {
  endpoint: process.env.DDB_ENDPOINT || 'http://localhost:8080',
  region: 'ap-northeast-1',
  accessKeyId: '',
  secretAccessKey: ''
};

const marshallOptions = {
  convertEmptyValues: false,
  removeUndefinedValues: true,
  convertClassInstanceToMap: true
};

const unmarshallOptions = {
  wrapNumbers: false
};

const translateConfig = { marshallOptions, unmarshallOptions };

const { DynamoDBClient, DeleteTableCommand, CreateTableCommand, DescribeTableCommand, ListTablesCommand } = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient(config);

const { DynamoDBDocumentClient, QueryCommand, TransactWriteCommand, DeleteCommand, ScanCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const ddbDocClient = DynamoDBDocumentClient.from(client, translateConfig);

const ShortUniqueId = require('short-unique-id');

const uid = new ShortUniqueId();

module.exports.saveReservation = async ({reservation, members}) => {

  try {
    console.log('saveReservation in: reservation, members:' + JSON.stringify({reservation, members}));

    const reservarionRecord = reservation;

    const reservationParams = getReservationParams(reservarionRecord);

    const memberParams = getPutMemberParams(members);

    const params = reservationParams.concat(memberParams);

    const command = new TransactWriteCommand({
      TransactItems: params
    });

    const result = await ddbDocClient.send(command).catch(error => {
        console.log('saveReservation out: error:' + JSON.stringify(error))
        throw error;
    });

    console.log('saveReservation out: result:' + JSON.stringify(result));

  } catch (err) {
    console.error('saveReservation out: err:');
    console.error(err);
  }


};

const getReservationParams = (record) => {

  console.log('getReservationParams in: record:' + JSON.stringify(record));

  let params = [];
  if (record) {
    params = [{
      Put: {
        TableName: TBL_RESERVATION,
        Item: record,
        // ExpressionAttributeNames : {
        //     '#pk' : 'listingId'
        // },
        // ConditionExpression: 'attribute_not_exists(#pk)'
      }
    }];
  }

  console.log('getReservationParams out: params:' + JSON.stringify(params));

  return params;

};

const getPutMemberParams = (records) => {

  console.log('getPutMemberParams in: records:' + JSON.stringify(records));

  const params = records.map(record => {
    return {
      Put: {
          TableName: TBL_MEMBER,
          Item: record,
          // ExpressionAttributeNames : {
          //     '#pk' : 'reservationCode'
          // },
          // ConditionExpression: 'attribute_not_exists(#pk)'
        }
      }
  });

  console.log('getPutMemberParams out: params:' + JSON.stringify(params));

  return params;
};

module.exports.deleteReservation = async ({listingId, reservationCode}) => {

  console.log('deleteReservation in:' + JSON.stringify({listingId, reservationCode}));

  const param = {
    TableName: TBL_RESERVATION,
    Key: {
      reservationCode: reservationCode,
      listingId: listingId
    }
  };

  const command = new DeleteCommand(param);

  const results = await ddbDocClient.send(command);

  console.log('deleteReservation out: results:' + JSON.stringify(results));

  return results;
};

module.exports.deleteMembers = async (records) => {

  console.log('deleteMembers in: records:' + JSON.stringify(records));

  const params = getDelMemberParams(records);

  const results = await Promise.all(params.map(async (param) => {
    const command = new DeleteCommand(param);
    return await ddbDocClient.send(command); 

  }));

  console.log('deleteMembers out: results:' + JSON.stringify(results));

  return results;
};

const getDelMemberParams = (records) => {

  console.log('getDelMemberParams in: records:' + JSON.stringify(records));

  const params = records.map(record => {
    return {
      TableName: TBL_MEMBER,
      Key: {
        reservationCode: record.reservationCode,
        memberNo: record.memberNo
      }
    }
  });

  console.log('getDelMemberParams out: params:' + JSON.stringify(params));

  return params;
};

module.exports.getReservation = async ({reservationCode, listingId}) => {

  console.log('getReservation in: reservationCode:' + reservationCode);
  console.log('getReservation in: listingId:' + listingId);

  const memberCmd = new QueryCommand({
    TableName: TBL_MEMBER,
    KeyConditionExpression: 'reservationCode = :pk',
    ExpressionAttributeValues: {':pk': reservationCode}
  });

  const memberResult = await ddbDocClient.send(memberCmd);

  console.log('getReservation memberResult:' + JSON.stringify(memberResult));

  const reservationCmd = new QueryCommand({
    TableName: TBL_RESERVATION,
    KeyConditionExpression: 'listingId = :pk and reservationCode = :rk',
    ExpressionAttributeValues: {':pk': listingId, ':rk': reservationCode}
  });

  const reservationResult = await ddbDocClient.send(reservationCmd);

  console.log('getReservation reservationResult:' + JSON.stringify(reservationResult));

  if (reservationResult.Items.length == 0) {
    console.log('getReservation out: result: null');
    return null;
  } else {
    const reservation = Object.assign({}, reservationResult.Items[0]);

    const result = {
      reservation: reservation,
      members: memberResult.Items
    };

    console.log('getReservation out: result:' + JSON.stringify(result));

    return result;
  }

};

const getScannerRecord = async (param) => {

  console.log(`storage-api getScannerRecord in: ${JSON.stringify(param)}`);

  const data = await ddbDocClient.send(
    new QueryCommand({
      TableName: TBL_SCANNER,
      IndexName: IDX_LISTINGID_TERMINALKEY,
      KeyConditionExpression: '#hkey = :hkey AND #rkey = :rkey',
      ExpressionAttributeNames : {
          '#hkey' : 'listingId',
          '#rkey' : 'terminalKey'
      },
      ExpressionAttributeValues: {
        ':hkey': param.listingId,
        ':rkey': param.terminalKey
      }

    })
  ).catch(error => {
    console.log('storage-api getScannerRecord error', JSON.stringify(error));
    throw error;
  });

  if (data.Items.length == 0) {
    param.uuid = uid.randomUUID(6);
  } else {
    const index = data.Items.findIndex(item => {
      if (param.roomCode) {
        if (item.roomCode) {
          if (item.roomCode == param.roomCode) {
            return true;
          } else {
            return false;
          }
        } else {
          return false;
        }
      } else {
        if (item.roomCode) {
          return false;
        } else {
          return true;
        }
      }
    });

    if (index > -1) {
      param.uuid = data.Items[index].uuid;  

    } else {
      param.uuid = uid.randomUUID(6);
    }
    
  }

  console.log(`storage-api getScannerRecord out: ${JSON.stringify(param)}`);

  return param;
};

module.exports.updateScanners = async (params, terminalKey) => {

    console.log('storage-api.updateScanners in: params:' + JSON.stringify({params, terminalKey}));

    const crtTimestamp = (new Date).toISOString();

    const rtnParams = await Promise.all(params.map(async (param) => {
      const rtn = await getScannerRecord(param);
      rtn.lastUpdateOn = crtTimestamp;
      // rtn.hostId = process.env.HOST_ID;

      return rtn;
    }));

    const txnParams = rtnParams.map((param) => {
      return {
        Put: {
          TableName: TBL_SCANNER,
          Item: param
        }
      }
    });

    const delParams = await getDelScannerParams(terminalKey);

    await Promise.all(delParams.map(async (param) => {
      const command = new DeleteCommand(param);
      return await ddbDocClient.send(command); 

    }));

    const txnCommand = new TransactWriteCommand({
      TransactItems: txnParams
    });

    await ddbDocClient.send(txnCommand);

    console.log('storage-api.updateScanners out:' + JSON.stringify(rtnParams));

    return rtnParams;

};

const getDelScannerParams = async (terminalKey) => {

  console.log('storage-api.getDelScannerParams in: terminalKey:' + terminalKey);

  const param = {
    TableName: TBL_SCANNER,
    IndexName: IDX_TERMINALKEY,
    KeyConditionExpression: 'terminalKey = :terminalKey',
    ExpressionAttributeValues: {
      ':terminalKey': terminalKey
    }    
  };

  const command = new QueryCommand(param);

  const data = await ddbDocClient.send(command);

  const params = data.Items.map(item => {
    return {
      TableName: TBL_SCANNER,
      Key: {
        uuid: item.uuid
      }
    }
  });

  console.log('storage-api.getDelScannerParams out: params:' + JSON.stringify(params));

  return params;
};

module.exports.getScanners = async ({listingId, roomCode}) => {

  console.log('storage-api.getScanners in:' + JSON.stringify({listingId, roomCode}));

  let param;

  if (listingId) {
    if (roomCode) {
      param = {
        TableName: TBL_SCANNER,
        IndexName: IDX_LISTINGID_ROOMCODE,
        KeyConditionExpression: '#hkey = :hkey AND #rkey = :rkey',
        ExpressionAttributeNames : {
            '#hkey' : 'listingId',
            '#rkey' : 'roomCode'
        },
        ExpressionAttributeValues: {
          ':hkey': listingId,
          ':rkey': roomCode
        }    
      };
    } else {
      param = {
        TableName: TBL_SCANNER,
        IndexName: IDX_LISTINGID_TERMINALKEY,
        KeyConditionExpression: '#hkey = :hkey',
        ExpressionAttributeNames : {
            '#hkey' : 'listingId'
        },
        ExpressionAttributeValues: {
          ':hkey': listingId
        }     
      };
    }
  } else {
    throw new Error('getScanners: listingId is required!!')
  }

  const command = new QueryCommand(param);

  let result;
  
  try {
    result = await ddbDocClient.send(command);
  } catch (err) {
    console.error(`getScanners with listingId: ${listingId} and roomCode: ${roomCode} has err.name: ${err.name}`);
    console.error(`getScanners with listingId: ${listingId} and roomCode: ${roomCode} has err.message: ${err.message}`);
    console.error(err.stack);
    console.trace();

    return [];
  }
  


  console.log('storage-api.getScanners result:' + JSON.stringify(result));

  const localIps = result.Items.map(item => item.localIp);

  console.log('storage-api.getScanners localIps:' + JSON.stringify(localIps));

  return [...new Set(localIps)];

};

module.exports.saveScanRecord = async (record) => {

  console.log('storage-api.saveScanRecord in: record:', record);

  const params = [{
    Put: {
      TableName: TBL_RECORD,
      Item: record,
      ExpressionAttributeNames : {
          '#pk' : 'terminalKey'
      },
      ConditionExpression: 'attribute_not_exists(#pk)'
    }
  }];

  const command = new TransactWriteCommand({
    TransactItems: params
  });

  const result = await ddbDocClient.send(command);  

  console.log('storage-api.saveScanRecord out: result:' + JSON.stringify(result));

  return result;
};


module.exports.saveMembers = async (records) => {

  console.log('storage-api.saveMembers in: records:', records);

  const params = records.map(reord => {
    return {
      Put: {
          TableName: TBL_MEMBER,
          Item: record,
          ExpressionAttributeNames : {
              '#pk' : 'reservationCode'
          },
          ConditionExpression: 'attribute_not_exists(#pk)'
        }
      }
  });

  const command = new TransactWriteCommand({
    TransactItems: params
  });

  const result = await ddbDocClient.send(command); 

  console.log('storage-api.saveMembers out: result:', result);

  return result;
};

module.exports.saveReservationRecord = async (record) => {

  console.log('storage-api.saveReservationRecord in: record:', record);

  const params = [{
    Put: {
      TableName: TBL_RESERVATION,
      Item: record,
      ExpressionAttributeNames : {
          '#pk' : 'listingId'
      },
      ConditionExpression: 'attribute_not_exists(#pk)'
    }
  }];

  const command = new TransactWriteCommand({
    TransactItems: params
  });

  const result = await ddbDocClient.send(command);  

  console.log('storage-api.saveReservationRecord out: result:', result);

  return result;

};

module.exports.getMember = async ({reservationCode, memberNo}) => {

  console.log('storage-api.getMember in:' + JSON.stringify({reservationCode, memberNo}));

  const memberCmd = new QueryCommand({
    TableName: TBL_MEMBER,
    KeyConditionExpression: 'reservationCode = :pk and memberNo = :rk',
    ExpressionAttributeValues: {
      ':pk': reservationCode,
      ':rk': parseInt(memberNo),
    }
  });

  const memberResult = await ddbDocClient.send(memberCmd);

  console.log('storage-api.getMember out: memberResult:' + JSON.stringify(memberResult));

  return memberResult.Items[0];

};

module.exports.updateHost = async (hostId) => {

  console.log('storage-api.updateHost in:' + hostId);

  if (!hostId) {
    console.log('storage-api.updateHost out');
    return;
  }


  const params = [{
    Put: {
      TableName: TBL_HOST,
      Item: { hostId },
      // ExpressionAttributeNames : {
      //     '#pk' : 'hostId'
      // },
      // ConditionExpression: 'attribute_not_exists(#pk)'
    }
  }];

  const command = new TransactWriteCommand({
    TransactItems: params
  });

  const result = await ddbDocClient.send(command);  

  console.log('storage-api.updateHost out: result:' + JSON.stringify(result));

  return;

};

module.exports.getHostId = async () => {

  console.log('storage-api.getHostId in');


  const scanParam = {
    TableName : TBL_HOST,
    PageSize : 1
  };

  const scanCmd = new ScanCommand(scanParam);

  const scanResult = await ddbDocClient.send(scanCmd);

  let hostId;
  if (scanResult.Items) {
    hostId = scanResult.Items[0].hostId;    
  }

  console.log('storage-api.updateHost out: hostId:' + hostId);

  return hostId

};

module.exports.deleteListing = async ({hostId, listingId}) => {

  console.log('storage-api.deleteListing in:' + JSON.stringify({hostId, listingId}));


  const param = {
    TableName: TBL_LISTING,
    Key: {
      hostId: hostId,
      listingId: listingId
    }
  };

  const command = new DeleteCommand(param);

  const result = await ddbDocClient.send(command);

  console.log('storage-api.deleteListing out: result:' + JSON.stringify(result));

  return;

};

module.exports.updateListing = async ({hostId, listingId, internalName}) => {

  console.log('storage-api.updateListing in:' + JSON.stringify({hostId, listingId, internalName}));


  const params = [{
    Put: {
      TableName: TBL_LISTING,
      Item: {hostId, listingId, internalName}
    }
  }];

  const command = new TransactWriteCommand({
    TransactItems: params
  });

  const result = await ddbDocClient.send(command);  

  console.log('storage-api.updateListing out: result:' + JSON.stringify(result));

  return;

};

module.exports.getListings = async () => {

  console.log('storage-api.getListings in');

  const scanParam = {
    TableName : TBL_LISTING,
    PageSize : 100
  };

  const scanCmd = new ScanCommand(scanParam);

  const scanResult = await ddbDocClient.send(scanCmd);

  console.log('storage-api.getListings out:' + JSON.stringify(scanResult.Items));

  return scanResult.Items

};

module.exports.getListing = async (internalName) => {

  console.log('getListing in: internalName:' + internalName);

  const param = {
    TableName: TBL_LISTING,
    IndexName: IDX_INTERNALNAME,
    KeyConditionExpression: 'internalName = :internalName',
    ExpressionAttributeValues: {
      ':internalName': internalName
    }    
  };

  const command = new QueryCommand(param);

  const data = await ddbDocClient.send(command);

  if (data.Items.length == 0) {
    console.log('getListing out');

    return;
  } else {
    console.log('getListing out:' + JSON.stringify(data.Items[0]));

    return data.Items[0];
  }
};

module.exports.initializeDatabase = async () => {

  console.log('storage-api.initializeDatabase in:');

  const hostDeleteCmd = new DeleteTableCommand({
    TableName: TBL_HOST
  });

  const listingDeleteCmd = new DeleteTableCommand({
    TableName: TBL_LISTING
  });

  const reservationDeleteCmd = new DeleteTableCommand({
    TableName: TBL_RESERVATION
  });

  const memberDeleteCmd = new DeleteTableCommand({
    TableName: TBL_MEMBER
  });

  const scannerDeleteCmd = new DeleteTableCommand({
    TableName: TBL_SCANNER
  });

  const recordDeleteCmd = new DeleteTableCommand({
    TableName: TBL_RECORD
  });

  const hostCmd = new CreateTableCommand({
    TableName: TBL_HOST,
    KeySchema: [
      { AttributeName: 'hostId', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'hostId', AttributeType: 'S' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  });

  const listingCmd = new CreateTableCommand({
    TableName: TBL_LISTING,
    KeySchema: [
      { AttributeName: 'hostId', KeyType: 'HASH' },
      { AttributeName: 'listingId', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'hostId', AttributeType: 'S' },
      { AttributeName: 'listingId', AttributeType: 'S' },
      { AttributeName: 'internalName', AttributeType: 'S' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    },
    GlobalSecondaryIndexes: [
      {
        IndexName: IDX_INTERNALNAME,
        KeySchema: [
          { AttributeName: 'internalName', KeyType: 'HASH'}
        ],
        Projection: {
          ProjectionType: 'ALL'
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ]
  });

  const reservationCmd = new CreateTableCommand({
    TableName: TBL_RESERVATION,
    KeySchema: [
      { AttributeName: 'listingId', KeyType: 'HASH' },
      { AttributeName: 'reservationCode', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'listingId', AttributeType: 'S' },
      { AttributeName: 'reservationCode', AttributeType: 'S' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  });


  const memberCmd = new CreateTableCommand({
    TableName: TBL_MEMBER,
    KeySchema: [
      { AttributeName: 'reservationCode', KeyType: 'HASH' },
      { AttributeName: 'memberNo', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'memberNo', AttributeType: 'N' },
      { AttributeName: 'reservationCode', AttributeType: 'S' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  });


  const scannerCmd = new CreateTableCommand({
    TableName: TBL_SCANNER,
    KeySchema: [
      { AttributeName: 'uuid', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'uuid', AttributeType: 'S' },
      { AttributeName: 'listingId', AttributeType: 'S' },
      { AttributeName: 'terminalKey', AttributeType: 'S' },
      { AttributeName: 'roomCode', AttributeType: 'S' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    },
    GlobalSecondaryIndexes: [
      {
        IndexName: IDX_TERMINALKEY,
        KeySchema: [
          { AttributeName: 'terminalKey', KeyType: 'HASH'}
        ],
        Projection: {
          ProjectionType: 'ALL'
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      },
      {
        IndexName: IDX_LISTINGID_TERMINALKEY,
        KeySchema: [
          { AttributeName: 'listingId', KeyType: 'HASH'},
          { AttributeName: 'terminalKey', KeyType: 'RANGE'}
        ],
        Projection: {
          ProjectionType: 'ALL'
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      },
      {
        IndexName: IDX_LISTINGID_ROOMCODE,
        KeySchema: [
          { AttributeName: 'listingId', KeyType: 'HASH'},
          { AttributeName: 'roomCode', KeyType: 'RANGE'}
        ],
        Projection: {
          ProjectionType: 'ALL'
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ]
  });

  const recordCmd = new CreateTableCommand({
    TableName: TBL_RECORD,
    KeySchema: [
      { AttributeName: 'terminalKey', KeyType: 'HASH' },
      { AttributeName: 'eventTimestamp', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'terminalKey', AttributeType: 'S' },
      { AttributeName: 'eventTimestamp', AttributeType: 'N' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  });

  const deleteResults = await Promise.allSettled([
    ddbDocClient.send(hostDeleteCmd),
    ddbDocClient.send(listingDeleteCmd),
    ddbDocClient.send(reservationDeleteCmd),
    ddbDocClient.send(memberDeleteCmd),
    ddbDocClient.send(scannerDeleteCmd),
    ddbDocClient.send(recordDeleteCmd)
  ]);

  console.log('initializeDatabase deleteResults:' + JSON.stringify(deleteResults));

  const createResults = await Promise.allSettled([
    ddbDocClient.send(hostCmd),
    ddbDocClient.send(listingCmd),
    ddbDocClient.send(reservationCmd),
    ddbDocClient.send(memberCmd),
    ddbDocClient.send(scannerCmd),
    ddbDocClient.send(recordCmd)
  ]);

  console.log('initializeDatabase createResults:' + JSON.stringify(createResults));

  console.log('storage-api.initializeDatabase out');

  return;

};

module.exports.checkDynamoDB = async () => {

  console.log('storage-api.checkDynamoDB in');

  const hostCmd = new ListTablesCommand({
    ExclusiveStartTableName: TBL_HOST,
    Limit: 1
  });

  const listingCmd = new ListTablesCommand({
    ExclusiveStartTableName: TBL_LISTING,
    Limit: 1
  });

  const reservationCmd = new ListTablesCommand({
    ExclusiveStartTableName: TBL_RESERVATION,
    Limit: 1
  });

  const memberCmd = new ListTablesCommand({
    ExclusiveStartTableName: TBL_MEMBER,
    Limit: 1
  });

  const scannerCmd = new ListTablesCommand({
    ExclusiveStartTableName: TBL_SCANNER,
    Limit: 1
  });

  const recordCmd = new ListTablesCommand({
    ExclusiveStartTableName: TBL_RECORD,
    Limit: 1
  });

  const results = await Promise.all([
    ddbDocClient.send(hostCmd),
    ddbDocClient.send(listingCmd),
    ddbDocClient.send(reservationCmd),
    ddbDocClient.send(memberCmd),
    ddbDocClient.send(scannerCmd),
    ddbDocClient.send(recordCmd)
  ]).catch(err => {
    console.error(`storage-api.checkDynamoDB err: ${err.message}`);
    throw new Error('The local database of the IoT Edge Gateway is unavailable or not setup correctly');
  });

  console.log('storage-api.checkDynamoDB out');

  return;
};