const express = require('express');
const routerHandler = require('./handler/router');

const storage = require('./api/storage');
const iot = require('./api/iot');
const scanner = require('./api/scanner');
const iotEventHandler = require('./handler/iotEvent');

const GROUP_ID = process.env.GROUP_ID
const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;
const AWS_IOT_THING_ARN = process.env.AWS_IOT_THING_ARN;
const AWS_GREENGRASS_GROUP_NAME = process.env.AWS_GREENGRASS_GROUP_NAME;
const CORE_PORT = process.env.CORE_PORT || 8081;


// This is a handler which does nothing for this example
exports.handler = async function(event, context) {
    // console.log('event: ' + JSON.stringify(event));
    // console.log('context: ' + JSON.stringify(context));

    try {

        if (context.clientContext.Custom.subject.indexOf('init_db') > -1) {
            
            await storage.initializeDatabase();

        } else if (context.clientContext.Custom.subject == `$aws/things/${AWS_IOT_THING_NAME}/shadow/update/delta`) {
            console.log('shadow/update/delta event.state:' + JSON.stringify(event.state));

            await iotEventHandler.handler(event);
        }
    } catch (err) {
        console.error('!!!!!!error happened at handler start!!!!!!');
        console.error(err.name);
        console.error(err.message);
        console.error(err.stack);
        console.trace();
        console.error('!!!!!!error happened at handler end!!!!!!');
    }

    const promise = new Promise(function(resolve, reject) {
      console.log("Promise callback");
      resolve();
    });

    return promise;
};

const initialize = async () => {

    console.log('Edge gateway initialize in');
    await storage.checkDynamoDB();

    if (!process.env.HOST_ID || !process.env.STAGE) {
        const result = await storage.getHost();
        process.env.HOST_ID = result.hostId;
        process.env.STAGE = result.stage;
    }

    if (!process.env.PROPERTY_CODE) {
        if (process.env.HOST_ID) {
            const property = await storage.getProperty(process.env.HOST_ID);    
            process.env.PROPERTY_CODE = property.propertyCode;                    
        }
    }

    if (!process.env.EXPRESS_RUNNING) {
        startWeb();
    }

    console.log('Edge gateway initialize out');
};

const startWeb = () => {

    console.log('Edge gateway startWeb in');

    const app = express();

    app.use(express.json({limit: '50mb'})); 
    app.use(express.urlencoded({limit: '50mb', extended: true}));
    routerHandler(app);

    app.listen(CORE_PORT, () => {
        console.log(`Edge gateway webapp listening on port ${CORE_PORT}!`);
        process.env.EXPRESS_RUNNING = true;
    });

    console.log('Edge gateway startWeb out');
};

setTimeout(async () => {
    try {
        await initialize();
    } catch (err) {
        console.error('!!!!!!error happened at iotEventHandler method start!!!!!!');
        console.error(err.name);
        console.error(err.message);
        console.error(err.stack);
        console.trace();
        console.error('!!!!!!error happened at iotEventHandler method end!!!!!!');
    } 
}, 10000);

setInterval(async () => {
    try {
        await initialize().catch(error => {});

        await iotEventHandler.handler();

    } catch (err) {
        console.error('!!!!!!error happened at iotEventHandler method start!!!!!!');
        console.error(err.name);
        console.error(err.message);
        console.error(err.stack);
        console.trace();
        console.error('!!!!!!error happened at iotEventHandler method end!!!!!!');
    } 
}, 300000);

