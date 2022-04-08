
/* 
The order lambda function logic
Retrieves order users related info from database
Combine all info in final payload
*/
const AWS = require('aws-sdk');

const mysql2 = require('mysql2'); //https://www.npmjs.com/package/mysql2

const { v4: uuidv4 } = require('uuid');

const responseHeaders = {
    // CORS header as the API is in AWS Gateway while the site is in CloudFront
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-allow-Methods': 'GET,OPTIONS,PUT,POST,DELETE',
    'access-Control-Allow-Origin': process.env.ACCESS_CONTROL_ALLOW_ORIGIN,
    'Content-Type': 'application/json',
    'strict-transport-security': 'max-age=63072000; includeSubdomains; preload',
    'content-security-policy': "object-src 'self' blob: https:; img-src 'self' blob: https:; script-src 'self' https://sdk.amazonaws.com;  default-src https:;", 
    'x-content-type-options': 'nosniff', 
    'x-frame-options': 'DENY', 
    'x-xss-protection': '1; mode=block' 
}

const responseBlobHeaders = {
    // CORS header as the API is in AWS Gateway while the site is in CloudFront
    'Access-Control-Allow-Credentials': responseHeaders['Access-Control-Allow-Credentials'],
    'Access-Control-Allow-Headers': responseHeaders['Access-Control-Allow-Headers'],
    'Access-Control-allow-Methods': responseHeaders['Access-Control-allow-Methods'],
    'access-Control-Allow-Origin': responseHeaders['access-Control-Allow-Origin'],
    'Content-Type': 'image/png',
    'strict-transport-security': 'max-age=63072000; includeSubdomains; preload',
    'content-security-policy': "object-src 'self' blob: https:; img-src 'self' blob: https:; script-src 'self' https://sdk.amazonaws.com;  default-src https:;", 
    'x-content-type-options': 'nosniff', 
    'x-frame-options': 'DENY', 
    'x-xss-protection': '1; mode=block' 
}

// Max records can be retrieved in a all orders request
const max_batch_records = 5;

var dbConnection = null;

exports.main = async function (event, context) {
    // https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html
    context.callbackWaitsForEmptyEventLoop = false;

    // set response to null for worst case setup
    var response = null;

    // Note the return in try block will just exist to finally block, 
    // so the response is not in return, but rather in variable for finally block to pickup
    try {
        // Create DB connection
        await createDBConnection();

        if (event.resource == "/orders") {
            if (event.httpMethod == "GET") {
                // Reason for a low limit is due to the STS policy size limitation, explain in later section on STS generation
                var limit = max_batch_records;
                var offset = 0;

                var queryStringParameters = event.queryStringParameters;
                if (queryStringParameters) {
                    // For each number parameter, need to first check if the query exist, then check if the parseInt result is a number (if isNaN is false, then result is a number)
                    if (queryStringParameters.limit && !isNaN(parseInt(queryStringParameters.limit))) {
                        var inputLimit = parseInt(queryStringParameters.limit);

                        // only accept max limit (max number of records up to 10)
                        if (inputLimit > 0 && inputLimit < max_batch_records) {
                            limit = inputLimit;
                        }
                    }

                    if (queryStringParameters.offset && !isNaN(parseInt(queryStringParameters.offset))) {
                        var inputOffset = parseInt(queryStringParameters.offset);
                        if (inputOffset > 0) {
                            offset = inputOffset;
                        }
                    }
                }

                var orders = await getOrders(limit, offset);
                // assign response
                response = {
                    statusCode: 200,
                    headers: responseHeaders,
                    body: JSON.stringify(orders)
                };
                return;
            }
        }
        else if (event.resource == "/order/{orderId}" || event.resource == "/order/{orderId}/blob") {
            const { orderId } = event.pathParameters;

            if (!orderId) {
                // Return 400 as incorrect input
                response = {
                    statusCode: 400,
                    headers: responseHeaders,
                    body: JSON.stringify({ "error": "invalid parameters" })
                };
                return;
            }

            var order = await getOrderByOrderId(orderId);

            if (!order) {
                // Return 400 as incorrect input
                response = {
                    statusCode: 404,
                    headers: responseHeaders,
                    body: JSON.stringify({ "error": "order not found" })
                };
                return;
            }

            if (event.resource == "/order/{orderId}") {
                if (event.httpMethod == "GET") {
                    response = {
                        statusCode: 200,
                        headers: responseHeaders,
                        body: JSON.stringify(order)
                    };
                    return;
                }
                else if (event.httpMethod == "PUT") {
                    // Will only extract description, rest portion will use the one from DB
                    var input = JSON.parse(event.body);

                    if (!input.description) {
                        // Return 400 as incorrect input
                        response = {
                            statusCode: 400,
                            headers: responseHeaders,
                            body: JSON.stringify({ "error": "invalid parameters" })
                        };
                        return;
                    }

                    order.description = await trimDescription(input.description);

                    await updateOrderByOrderId(order);

                    order = await getOrderByOrderId(orderId);

                    response = {
                        statusCode: 200,
                        headers: responseHeaders,
                        body: JSON.stringify(order)
                    };
                    return;
                }
                else if (event.httpMethod == "DELETE") {
                    await deleteOrderByOrderId(order);

                    response = {
                        statusCode: 204,
                        headers: responseHeaders
                    };
                    return;
                }
            }
            // Create presigned url
            else if (event.resource == "/order/{orderId}/blob") {
                if (event.httpMethod == "GET") {
                    var order_blob = await getOrderBlobByOrderId(orderId);

                    if (order_blob) {
                        order_blob = order_blob.toString('base64');
                    }

                    response = {
                        statusCode: 200,
                        headers: responseBlobHeaders,
                        body: order_blob,
                        isBase64Encoded: true
                    };

                    return;
                }
                if (event.httpMethod == "POST") {

                    if (event.isBase64Encoded) {
                        order.order_blob = Buffer.from(event.body, 'base64');
                    }
                    else {
                        order.order_blob = Buffer.from(event.body, 'binary');
                    }

                    await updateOrderBlobByOrderId(order);

                    response = {
                        statusCode: 204,
                        headers: responseHeaders
                    };

                    return;
                }
            }
        }
        // Create new order, in this case, create an Order ID record, with a predefined prefix (but S3 will not have that file, need later upload)
        else if (event.resource == "/order") {
            if (event.httpMethod == "POST") {
                var newOrder = {
                    orderId: uuidv4(),
                    description: "Default Description",
                    order_blob: new Buffer.from("".toString('base64'), 'base64')                  // Blob of empty to indicate empty content, as the creation do not include BLOB by default
                }

                // Get description if one exist
                // Do a check if it exist and if it is type of string
                if (event.body) {
                    var body = JSON.parse(event.body)
                    if (body.description && typeof body.description == "string")
                        newOrder.description = await trimDescription(body.description);
                }

                // Create a record
                await createOrder(newOrder);

                // Get order by orderId 
                var order = await getOrderByOrderId(newOrder.orderId);

                response = {
                    statusCode: 200,
                    headers: responseHeaders,
                    body: JSON.stringify(order)
                };
                return;
            }
        }
    } catch (error) {
        // Print error into log and return 500 as response
        var body = error.stack || JSON.stringify(error, null, 2);
        console.error(body)
        response = {
            statusCode: 500,
            headers: responseHeaders,
            body: JSON.stringify({ "error": "server backend error" })
        }
    } finally {
        await closeDBConnection();

        if (!response) {
            // No valid response mapping, return 400
            response = {
                statusCode: 400,
                headers: responseHeaders,
                body: JSON.stringify({ "error": "invalid API request" })
            };
        }

        // Return final response
        return response;
    }
}

/**
 * Get orders based on setup limit and passed in parameters
 * @param {*} limit the max record to respond
 * @param {*} offset to start the record
 * @returns response object contains orders based on limit and offset along with helper fields
 * {
        'orders': orders,
        'limit': limit,
        'offset': offset,
        'ordersCount': ordersCount,
        'pages': limit > ordersCount ? 0 : Math.floor(limit / ordersCount),
    }
 * 
 */
var getOrders = async function (limit, offset) {
    var ordersCount = await getOrdersCountDB();

    // only use offset if offset is less than order, otherwise set to order
    if (offset >= ordersCount) {
        // otherwise set to max
        offset = ordersCount;
    }

    var orders = await getOrdersDB(limit, offset);

    // Need to assemble a response, one reason is security practice should elimite directly return array (to avoid JSON Hijacking)
    return {
        // provider order in array
        'orders': orders,
        // provide offset to notify client this is the limit used by this request
        'limit': limit,
        // provide offset to notify client this is the offset used by this request
        'offset': offset,
        // provider order count for ui to diplay
        'ordersCount': ordersCount,
        // Provide the pages number for ui to display
        'pages': limit > ordersCount ? 0 : Math.floor(limit / ordersCount),
    }
};

/**
 * Create a new record into database
 * @param {*} orderId Order ID for record to be created
 * @param {*} description Description for that record
 * @param {*} s3Prefix Image prefix for that record
 */
var createOrder = async function (order) {

    if (!order.orderId || !order.description || !order.order_blob) {
        throw 'new object does not have required fields';
    }

    await createOrderDB(order);
};

/**
 * Get an existing record in DB
 * @param {*} orderId Order ID for record to be retrieved
 */
var getOrderByOrderId = async function (orderId) {
    return await getOrderByOrderIdDB(orderId);
};

/**
 * Get an existing record in DB
 * @param {*} orderId Order ID for record to be retrieved
 */
var getOrderBlobByOrderId = async function (orderId) {
    return await getOrderBlobByOrderIdDB(orderId);
};

/**
 * Update an existing record in DB
 * @param {*} order Order object to be updated
 */
var updateOrderByOrderId = async function (order) {
    await updateOrderByOrderIdDB(order);
};

/**
 * Update an existing record in DB
 * @param {*} order Order object to be updated, the order_blob field should be base64 encoded string
 */
var updateOrderBlobByOrderId = async function (order) {
    await updateOrderBlobByOrderIdDB(order);
};


/**
 * Delete an existing order record in S3 and DB
 * @param {*} order Order object to be updated
 */
var deleteOrderByOrderId = async function (order) {
    await deleteOrderByOrderIdDB(order.orderId);
};


/**
 * Trim input description to fix length if exceed. If exceed, will trim and add message, otherwise return original message
 *  @param {*} description
 */
var trimDescription = async function (description) {
    var maxLength = 30;
    var trimMessage = "(TRIM)";

    return description.length > maxLength ? description.substring(0, maxLength - trimMessage.length) + trimMessage : description;
};


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
            database: process.env.AURORA_CLUSTER_DATABASE_NAME,
            port: parseInt(process.env.AURORA_CLUSTER_PROXY_PORT),
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
var getOrdersCountDB = async function () {
    return new Promise(function (resolve, reject) {
        dbConnection.query('SELECT COUNT(`order_id`) FROM `' + process.env.AURORA_TABLE_NAME + '`;', function (error, results, fields) {
            if (error) {
                //throw error;

                console.log("ERROR " + error);
                reject("ERROR " + error);
            }

            try {
                resolve(parseInt(results[0]['COUNT(`order_id`)']));
            }
            catch (error) {
                reject(error);
            }
        });
    });
};


/**
 * 
 * Return the data record if found in array, otherwise return empty array
 */
var getOrdersDB = async function (limit, offset) {
    var rows = await new Promise(function (resolve, reject) {
        dbConnection.query('SELECT `order_id`, `description` FROM `' + process.env.AURORA_TABLE_NAME + '` ORDER BY `order_id` LIMIT ? OFFSET ?;', [limit, offset], function (error, results, fields) {
            if (error) {
                //throw error
                reject("ERROR " + error);
            }

            resolve(results);
        });
    });


    var transformResponses = [];

    // Format each record to object
    for (var index = 0; index < rows.length; index++) {
        transformResponses.push(await rowMapper(rows[index]));
    }

    return transformResponses;
};

/**
 * 
 * @param {*} orderId OrderId to search in database
 * 
 * Return the data record if found, otherwise return null
 */
var getOrderByOrderIdDB = async function (orderId) {
    var rows = await new Promise(function (resolve, reject) {
        dbConnection.query('SELECT `order_id`, `description` FROM `' + process.env.AURORA_TABLE_NAME + '` WHERE `order_id` = ?;', [orderId], function (error, results, fields) {
            if (error) {
                //throw error
                reject("ERROR " + error);
            }

            resolve(results);
        });
    });

    // If not null, transform the row with row mapper
    if (rows.length > 0) {
        return await rowMapper(rows[0]);
    }

    // If no record, return null to indicate no response
    return null;
};

/**
 * 
 * @param {*} orderId OrderId to search in database
 * 
 * Return the reocrd blob (as Buffer) otherwise return null
 */
var getOrderBlobByOrderIdDB = async function (orderId) {
    var record = await new Promise(function (resolve, reject) {
        dbConnection.query('SELECT `order_blob` FROM `' + process.env.AURORA_TABLE_NAME + '` WHERE `order_id` = ?;', [orderId], function (error, results, fields) {
            if (error) {
                //throw error
                reject("ERROR " + error);
            }

            // If not null, return the blob field
            if (results.length > 0) {

                resolve(results[0]['order_blob']);
            }

            resolve(null);
        });
    });

    // If no record, return null to indicate no response
    return record;
};


/**
 * Delete a record in DB based on inputted orderId
 * @param {*} orderId Order ID for record to be deleted
 */
var deleteOrderByOrderIdDB = async function (orderId) {
    await new Promise(function (resolve, reject) {
        dbConnection.query('DELETE FROM `' + process.env.AURORA_TABLE_NAME + '` WHERE `order_id` = ?;', [orderId], function (error, results, fields) {
            if (error) {
                //throw error
                reject("ERROR " + error);
            }

            resolve();
        });
    });
};

/**
 * Create a new record in DB
 * @param {*} order reocrd to be updated
 */
var createOrderDB = async function (order) {
    return new Promise(function (resolve, reject) {
        dbConnection.query('INSERT INTO `' + process.env.AURORA_TABLE_NAME + '` (`order_id`, `description`, `order_blob`) VALUES(?, ?, BINARY(?));', [order.orderId, order.description, order.order_blob], function (error, results, fields) {
            if (error) {
                //throw error
                reject("ERROR " + error);
            }

            resolve();
        });
    });
};

/**
 * Update non blob portion for an existing record in DB with 
 * @param {*} order order object 
 */
var updateOrderByOrderIdDB = async function (order) {
    return new Promise(function (resolve, reject) {
        dbConnection.query('UPDATE `' + process.env.AURORA_TABLE_NAME + '` SET `description` = ? WHERE `order_id` = ?;', [order.description, order.orderId], function (error, results, fields) {
            if (error) {
                //throw error
                reject("ERROR " + error);
            }

            resolve();
        });
    });
};

/**
* Update blob for existing record in DB
* @param {*} order object to be updated blob with, orderId and blob field will be used
*/
var updateOrderBlobByOrderIdDB = async function (order) {
    return new Promise(function (resolve, reject) {
        dbConnection.query('UPDATE `' + process.env.AURORA_TABLE_NAME + '` SET `order_blob` = ? WHERE `order_id` = ?;', [order.order_blob, order.orderId], function (error, results, fields) {
            if (error) {
                //throw error
                reject("ERROR " + error);
            }

            resolve();
        });
    });
};


/**
 * Transform DB record to JSON format record
 * Mapp the database column name with actual field
     {
    "order_id": "orderId",
    "description": "description",
    "s3_prefix": "s3Prefix"
}
 * @param {*} row db object represent an order row
 * @returns transformed object
 */
var rowMapper = async function (row) {

    return {
        'orderId': row['order_id'],
        'description': row['description'],
    };
};
