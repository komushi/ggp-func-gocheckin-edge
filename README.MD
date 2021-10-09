## create-table-listing.json
```
{
    "TableName": "GoCheckInListing",
    "KeySchema": [
      { "AttributeName": "listingId", "KeyType": "HASH" },
      { "AttributeName": "hostId", "KeyType": "RANGE" }
    ],
    "AttributeDefinitions": [
      { "AttributeName": "listingId", "AttributeType": "S" },
      { "AttributeName": "hostId", "AttributeType": "S" }
    ],
    "ProvisionedThroughput": {
      "ReadCapacityUnits": 5,
      "WriteCapacityUnits": 5
    }
}

```

## create-table-reservation.json
```
{
    "TableName": "GoCheckInReservation",
    "KeySchema": [
      { "AttributeName": "listingId", "KeyType": "HASH" },
      { "AttributeName": "reservationCode", "KeyType": "RANGE" }
    ],
    "AttributeDefinitions": [
      { "AttributeName": "listingId", "AttributeType": "S" },
      { "AttributeName": "reservationCode", "AttributeType": "S" }
    ],
    "ProvisionedThroughput": {
      "ReadCapacityUnits": 5,
      "WriteCapacityUnits": 5
    }
}

```


## create-table-member.json
```
{
    "TableName": "GoCheckInMember",
    "KeySchema": [
      { "AttributeName": "reservationCode", "KeyType": "HASH" },
      { "AttributeName": "memberNo", "KeyType": "RANGE" }
    ],
    "AttributeDefinitions": [
      { "AttributeName": "reservationCode", "AttributeType": "S" },
      { "AttributeName": "memberNo", "AttributeType": "N" }
    ],
    "ProvisionedThroughput": {
      "ReadCapacityUnits": 5,
      "WriteCapacityUnits": 5
    }
}

```

## create-table-scanner.json
```
{
    "TableName": "GoCheckInScanner",
    "KeySchema":
    [
        {
            "AttributeName": "listingId",
            "KeyType": "HASH"
        },
        {
            "AttributeName": "terminalKey",
            "KeyType": "RANGE"
        }
    ],
    "AttributeDefinitions":
    [
        {
            "AttributeName": "terminalKey",
            "AttributeType": "S"
        },
        {
            "AttributeName": "listingId",
            "AttributeType": "S"
        }
    ],
    "ProvisionedThroughput":
    {
        "ReadCapacityUnits": 5,
        "WriteCapacityUnits": 5
    }
}
```


## create-table-record.json
```
{
    "TableName": "GoCheckInRecord",
    "KeySchema": [
      { "AttributeName": "terminalKey", "KeyType": "HASH" },
      { "AttributeName": "eventTimestamp", "KeyType": "RANGE" }
    ],
    "AttributeDefinitions": [
      { "AttributeName": "terminalKey", "AttributeType": "S" },
      { "AttributeName": "eventTimestamp", "AttributeType": "N" }
    ],
    "ProvisionedThroughput": {
      "ReadCapacityUnits": 5,
      "WriteCapacityUnits": 5
    }
}
```

```
$ aws dynamodb create-table --cli-input-json file://create-table-reservation.json --endpoint-url http://192.168.11.36:8080

$ aws dynamodb create-table --cli-input-json file://create-table-member.json --endpoint-url http://192.168.11.36:8080

$ aws dynamodb create-table --cli-input-json file://create-table-scanner.json --endpoint-url http://192.168.11.36:8080

$ aws dynamodb create-table --cli-input-json file://create-table-record.json --endpoint-url http://192.168.11.36:8080
```

```
$ aws dynamodb scan --table-name GoCheckInScanner --endpoint-url http://192.168.11.36:8080
```


