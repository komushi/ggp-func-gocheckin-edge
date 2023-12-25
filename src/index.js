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

        await storage.checkDynamoDB();

        if (context.clientContext.Custom.subject.indexOf('init_db') > -1) {
            
            await storage.initializeDatabase();

        } else if (context.clientContext.Custom.subject == `$aws/things/${AWS_IOT_THING_NAME}/shadow/update/delta`) {
            console.log('shadow/update/delta event.state:' + JSON.stringify(event.state));

            await iotEventHandler.handler(event);

        } else if (context.clientContext.Custom.subject.indexOf('find_user') > -1 ) {
            console.log('find_user event: ' + JSON.stringify(event));

            await scanner.findUsers(event);

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

const initialize = () => {

    console.log('Edge gateway initialize in');

    const app = express();

    app.use(express.json({limit: '50mb'})); 
    app.use(express.urlencoded({limit: '50mb', extended: true}));
    routerHandler(app);

    app.listen(CORE_PORT, () => console.log(`Edge gateway webapp listening on port ${CORE_PORT}!`));

    setInterval(async () => {
        try {
            await storage.checkDynamoDB();
            
            await iotEventHandler.handler();

            if (!process.env.HOST_ID) {
                process.env.HOST_ID = await storage.getHostId();    
            }

            if (!process.env.PROPERTY_CODE) {
                if (process.env.HOST_ID) {
                    const property = await storage.getProperty(process.env.HOST_ID);    
                    process.env.PROPERTY_CODE = property.propertyCode;                    
                }
            }
        } catch (err) {
            console.error('!!!!!!error happened at initialize method start!!!!!!');
            console.error(err.name);
            console.error(err.message);
            console.error(err.stack);
            console.trace();
            console.error('!!!!!!error happened at initialize method end!!!!!!');
        } 
    }, 300000);

    console.log('Edge gateway initialize out');

};

initialize();


