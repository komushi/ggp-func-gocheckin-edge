const TBL_RESERVATION = process.env.TBL_RESERVATION;
const TBL_MEMBER = process.env.TBL_MEMBER;
const TBL_HOST = process.env.TBL_HOST;

const TBL_EQUIPMENT = process.env.TBL_EQUIPMENT;
const IDX_HOST_PROPERTYCODE = process.env.IDX_HOST_PROPERTYCODE;
const IDX_EQUIPMENT_ID = process.env.IDX_EQUIPMENT_ID;

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

//TODO
const getScannerRecord = async (param) => {

  console.log(`storage-api getScannerRecord in: ${JSON.stringify(param)}`);

  const data = await ddbDocClient.send(
    new QueryCommand({
      TableName: TBL_EQUIPMENT,
      IndexName: IDX_EQUIPMENT_ID,
      KeyConditionExpression: '#hkey = :hkey AND #rkey = :rkey',
      ExpressionAttributeNames : {
          '#hkey' : 'equipmentId',
          '#rkey' : 'roomCode'
      },
      ExpressionAttributeValues: {
        ':hkey': param.equipmentId,
        ':rkey': param.roomCode
      }
    })
  ).catch(error => {
    console.log('storage-api getScannerRecord error', JSON.stringify(error));
    throw error;
  });

  if (data.Items.length == 0) {
    param.uuid = uid.randomUUID(6);
  } else {
    param.uuid = data.Items[0].uuid;    
  }

  console.log(`storage-api getScannerRecord out: ${JSON.stringify(param)}`);

  return param;
};

module.exports.updateScanners = async (params, equipmentId) => {

    console.log('storage-api.updateScanners in: params:' + JSON.stringify({params, equipmentId}));

    const crtTimestamp = (new Date).toISOString();

    const rtnParams = await Promise.all(params.map(async (param) => {
      const rtn = await getScannerRecord(param);
      rtn.lastUpdateOn = crtTimestamp;
      return rtn;
    }));

    const txnParams = rtnParams.map((param) => {
      return {
        Put: {
          TableName: TBL_EQUIPMENT,
          Item: param
        }
      }
    });

    const delParams = await getDelScannerParams(equipmentId);

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


const getDelScannerParams = async (equipmentId) => {

  console.log('storage-api.getDelScannerParams in: equipmentId:' + equipmentId);

  const param = {
    TableName: TBL_EQUIPMENT,
    IndexName: IDX_EQUIPMENT_ID,
    KeyConditionExpression: 'equipmentId = :equipmentId',
    ExpressionAttributeValues: {
      ':equipmentId': equipmentId
    }    
  };

  const command = new QueryCommand(param);

  const data = await ddbDocClient.send(command);

  const params = data.Items.map(item => {
    return {
      TableName: TBL_EQUIPMENT,
      Key: {
        hostId: item.hostId,
        uuid: item.uuid
      }
    };
  });

  console.log('storage-api.getDelScannerParams out: params:' + JSON.stringify(params));

  return params;
};

module.exports.getScanners = async (roomCode) => {

  console.log('storage-api.getScanners in:' + roomCode);

  let param;


  if (roomCode) {
    param = {
      TableName: TBL_EQUIPMENT,
      IndexName: IDX_HOST_PROPERTYCODE,
      KeyConditionExpression: '#hkey = :hkey',
      FilterExpression: '#roomCode = :roomCode AND #category = :category',
      ExpressionAttributeNames : {
          '#hkey' : 'hostPropertyCode',
          '#roomCode' : 'roomCode',
          '#category' : 'category'
      },
      ExpressionAttributeValues: {
        ':hkey': `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`,
        ':roomCode': roomCode,
        ':category': 'SCANNER'
      }    
    };
  } else {
    console.log('storage-api.getScanners out empty');

    return [];
  }

  let result;
  
  try {
    const command = new QueryCommand(param);

    result = await ddbDocClient.send(command);
  } catch (err) {
    console.error(`getScanners with roomCode: ${roomCode} has err.name: ${err.name}`);
    console.error(`getScanners with roomCode: ${roomCode} has err.message: ${err.message}`);
    console.error(err.stack);
    console.trace();

    return [];
  }

  console.log('storage-api.getScanners result:' + JSON.stringify(result));

  const localIps = result.Items.map(item => item.localIp);

  console.log('storage-api.getScanners out localIps:' + JSON.stringify(localIps));

  return [...new Set(localIps)];

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

module.exports.updateHost = async ({hostId, stage}) => {

  console.log('storage-api.updateHost in:' + JSON.stringify({hostId, stage}));

  if (!hostId) {
    console.log('storage-api.updateHost out');
    return;
  }


  const params = [{
    Put: {
      TableName: TBL_HOST,
      Item: { hostId, stage },
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

module.exports.getHost = async () => {

  console.log('storage-api.getHost in');


  const scanParam = {
    TableName : TBL_HOST,
    PageSize : 1
  };

  const scanCmd = new ScanCommand(scanParam);

  const scanResult = await ddbDocClient.send(scanCmd);

  let result;
  if (scanResult.Items && scanResult.Items.length > 0) {
    result = scanResult.Items[0];    
  }

  if (!result) {
    throw new Error(`getHost empty`);
  }

  console.log('storage-api.getHost out: result:' + JSON.stringify(result));

  return result;

};

module.exports.getProperty = async (hostId) => {

  console.log('storage-api.getProperty in' + hostId);

  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: TBL_EQUIPMENT,
      KeyConditionExpression: '#hkey = :hkey',
      FilterExpression: '#category = :category',
      ExpressionAttributeNames : {
          '#hkey' : 'hostId',
          '#category': 'category'
      },
      ExpressionAttributeValues: {
        ':hkey': hostId,
        ':category': 'PROPERTY'
      }
    })
  );

  if (result.Items.length > 0) {
    console.log('storage-api.getProperty out: property' + JSON.stringify(result.Items[0]));

    return result.Items[0];

  } else {
    throw new Error(`getProperty empty`);
  }
};

module.exports.updatProperty = async (hostId, property) => {

  console.log('storage-api.updatProperty in' + JSON.stringify({hostId, property}));

  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: TBL_EQUIPMENT,
      KeyConditionExpression: '#hkey = :hkey',
      FilterExpression: '#category = :category',
      ExpressionAttributeNames : {
          '#hkey' : 'hostId',
          '#category': 'category'
      },
      ExpressionAttributeValues: {
        ':hkey': hostId,
        ':category': 'PROPERTY'
      }
    })
  );

  await Promise.all(result.Items.map(async (item) => {
    const param = {
      TableName: TBL_EQUIPMENT,
      Key: {
        hostId: item.hostId,
        uuid: item.uuid
      }
    };

    return await ddbDocClient.send(new DeleteCommand(param)); 

  }));

  const params = [{
    Put: {
      TableName: TBL_EQUIPMENT,
      Item: {
        hostId: hostId,
        uuid: property.uuid,
        hostPropertyCode: `${hostId}-${property.propertyCode}`,
        propertyCode: property.propertyCode,
        category: 'PROPERTY'
      }
    }
  }];

  const writeResult = await ddbDocClient.send(new TransactWriteCommand({TransactItems: params}));

  console.log('storage-api.updatProperty writeResult:' + JSON.stringify(writeResult));

  console.log('storage-api.updatProperty out');

  return;
};


module.exports.initializeDatabase = async () => {

  console.log('storage-api.initializeDatabase in:');

  const hostDeleteCmd = new DeleteTableCommand({
    TableName: TBL_HOST
  });

  const reservationDeleteCmd = new DeleteTableCommand({
    TableName: TBL_RESERVATION
  });

  const memberDeleteCmd = new DeleteTableCommand({
    TableName: TBL_MEMBER
  });

  const equipmentDeleteCmd = new DeleteTableCommand({
    TableName: TBL_EQUIPMENT
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

  const equipmentCmd = new CreateTableCommand({
    TableName: TBL_EQUIPMENT,
    KeySchema: [
      {
        AttributeName: 'hostId',
        KeyType: 'HASH'
      },
      {
        AttributeName: 'uuid',
        KeyType: 'RANGE'
      }
    ],
    AttributeDefinitions: [
      {
        AttributeName: 'uuid',
        AttributeType: 'S'
      },
      {
        AttributeName: 'hostPropertyCode',
        AttributeType: 'S'
      },
      {
        AttributeName: 'equipmentId',
        AttributeType: 'S'
      },
      {
        AttributeName: 'hostId',
        AttributeType: 'S'
      },
      {
        AttributeName: 'roomCode',
        AttributeType: 'S'
      }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    },
    GlobalSecondaryIndexes: [
      {
        IndexName: IDX_EQUIPMENT_ID,
        KeySchema: [
          {
            AttributeName: 'equipmentId',
            KeyType: 'HASH'
          },
          {
            AttributeName: 'roomCode',
            KeyType: 'RANGE'
          }
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
        IndexName: IDX_HOST_PROPERTYCODE,
        KeySchema: [
          {
            AttributeName: 'hostPropertyCode',
            KeyType: 'HASH'
          },
          {
            AttributeName: 'uuid',
            KeyType: 'RANGE'
          }
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

  const deleteResults = await Promise.allSettled([
    ddbDocClient.send(hostDeleteCmd),
    ddbDocClient.send(reservationDeleteCmd),
    ddbDocClient.send(memberDeleteCmd),
    ddbDocClient.send(equipmentDeleteCmd),
  ]);

  console.log('initializeDatabase deleteResults:' + JSON.stringify(deleteResults));

  const createResults = await Promise.allSettled([
    ddbDocClient.send(hostCmd),
    ddbDocClient.send(reservationCmd),
    ddbDocClient.send(memberCmd),
    ddbDocClient.send(equipmentCmd)
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

  const reservationCmd = new ListTablesCommand({
    ExclusiveStartTableName: TBL_RESERVATION,
    Limit: 1
  });

  const memberCmd = new ListTablesCommand({
    ExclusiveStartTableName: TBL_MEMBER,
    Limit: 1
  });

  const equipmentCmd = new ListTablesCommand({
    ExclusiveStartTableName: TBL_EQUIPMENT,
    Limit: 1
  });

  const results = await Promise.allSettled([
    ddbDocClient.send(hostCmd),
    ddbDocClient.send(reservationCmd),
    ddbDocClient.send(memberCmd),
    ddbDocClient.send(equipmentCmd)
  ]);

  console.log('storage-api.checkDynamoDB out:' + JSON.stringify(results));

  return results;
};