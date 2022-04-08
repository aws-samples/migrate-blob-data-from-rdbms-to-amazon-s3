
/* 
The order lambda function logic
Retrieves order users related info from database
Base on S3 asset info in record, generate correspond STS token to allow client to retrieve record
Combine all info in final payload
*/
const AWS = require('aws-sdk');

const mysql2 = require('mysql2'); //https://www.npmjs.com/package/mysql2

const fs = require('fs');
const readline = require('readline');

var dbConnection = null;

exports.main = async function (event, context) {
    // https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html
    context.callbackWaitsForEmptyEventLoop = false;

    var response = {};
    // Note the return in try block will just exist to finally block, 
    // so the response is not in return, but rather in variable for finally block to pickup
    try {
        // Create DB connection
        await createDBConnection();

        // Load target schema if loadTargetSchema is present and is true
        if(event.loadS3BlobSchema)
        {
            response.loadS3BlobSchema = await loadS3BlobSchema();
        }

        if(event.loadRDBMSSchema)
        {
            response.loadRDBMSSchema = await loadRDBMSSchema();
        }
    } catch (error) {
        // Print error into log and return 500 as response
        var body = error.stack || JSON.stringify(error, null, 2);
        console.error(body)
        response = { "error": body };
    } finally {
        await closeDBConnection();

        // Check if either execution has response
        // If not, insert error code
        if (!response.loadRDBMSSchema && !response.loadS3BlobSchema && !response.error) {
            response = { "error": "no schema is choosen" };
        }

        // Return final response
        return JSON.stringify(response);
    }
}

var loadS3BlobSchema = async function()
{
    var sqlCommand = await parseSQLFileToQuery('order.sql');
    
    return {result: await executeSQLQuery(sqlCommand)};
}

var loadRDBMSSchema = async function()
{
    var sqlCommand = await parseSQLFileToQuery('order_rdbms_blob.sql');

    return {result: await executeSQLQuery(sqlCommand)};
}

var parseSQLFileToQuery = async function (sqlFileName)
{
    const sqlFilestream = fs.createReadStream("sql_schema/" + sqlFileName);

    const readlineSQL = readline.createInterface({
        input: sqlFilestream,
        crlfDelay : Infinity // Use to treat crlf/lf as separate line
    });

    var sqlCommand = "";

    for await (const sqlLine of readlineSQL)
    {
        var line = sqlLine.trim()
        if(line != 0 && !line.startsWith('--'))
        {
            sqlCommand = sqlCommand + line;
        }
    }

    return sqlCommand;
}

/**
 * Populated the global dbConnection variable with connection or error out with promise rejection
 */
var createDBConnection = async function () {
    return new Promise(function (resolve, reject) {
        // https://aws.amazon.com/blogs/compute/using-amazon-rds-proxy-with-aws-lambda/
        var signer = new AWS.RDS.Signer({
            region: process.env.AWS_REGION,
            hostname: process.env.AURORA_CLUSTER_PROXY_HOSTNAME,
            port: parseInt(process.env.AURORA_CLUSTER_PROXY_PORT),
            username: process.env.AURORA_CLUSTER_USERNAME
        });

        var token = signer.getAuthToken({
            username: process.env.AURORA_CLUSTER_USERNAME
        });

        console.log("IAM Token obtained\n");

        var connectionConfig = {
            host: process.env.AURORA_CLUSTER_PROXY_HOSTNAME,
            user: process.env.AURORA_CLUSTER_USERNAME,
            port: parseInt(process.env.AURORA_CLUSTER_PROXY_PORT),
            database: process.env.AURORA_CLUSTER_DATABASE_NAME,
            ssl: { rejectUnauthorized: false },
            password: token,
            authPlugins: {
                mysql_clear_password: () => () => Buffer.from(token + '\0')
            }
        };

        dbConnection = mysql2.createConnection(connectionConfig);

        dbConnection.connect(function (err) {
            if (err) {
                console.log('error connecting: ' + err.stack);
                reject("ERROR");
                return;
            }

            console.log('connected as id ' + dbConnection.threadId + "\n");

            resolve();
        });
    });
};

/**
 * 
 * @param {*} connection DB connection to be closed
 * @returns 
 */
var closeDBConnection = async function () {
    return new Promise(function (resolve, reject) {
        // If not a valid connection, close it
        if (!dbConnection) {
            resolve();
            return;
        }

        dbConnection.end(function (error, results) {
            // If there is error, will log it, but not throw error as the close logic will be in final stack and end the lambda
            if (error) {
                console.log("error" + error.stack);
            }
            // The connection is terminated now 
            console.log("Connection ended\n");
            resolve();
        });
    });
};

/**
 * Get the total count of orders in database
 * @returns integer of total orders count or error from promise rejection
 */
var executeSQLQuery = async function (sqlQuery) {
    return new Promise(function (resolve, reject) {
        dbConnection.query(sqlQuery, function (error, results, fields) {
            if (error) {
                //throw error;
                console.log("ERROR " + error);
                reject("ERROR " + error);
            }
            try {
                resolve(results);
            }
            catch (error) {
                reject(error);
            }
        });
    });
};

