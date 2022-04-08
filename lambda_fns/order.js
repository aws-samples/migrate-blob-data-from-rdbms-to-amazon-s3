
/* 
The order lambda function logic
Retrieves order users related info from database
Base on S3 asset info in record, generate correspond STS token to allow client to retrieve record
Combine all info in final payload
*/
const AWS = require('aws-sdk');
// Need to treat STS specially due to VPC Endpoint. The reason need to be regional is the VPC endpoint is regional one, not global one DNS, so need to use regional endpoint
// https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_sts_vpce.html
// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/STS.html
// https://docs.aws.amazon.com/sdkref/latest/guide/setting-global-sts_regional_endpoints.html
const STS = new AWS.STS({
    stsRegionalEndpoints: 'regional'
});

const S3 = new AWS.S3({
    region: process.env.AWS_REGION,
    maxRetries: 3,
    signatureVersion: "v4"
});

const mysql2 = require('mysql2'); //https://www.npmjs.com/package/mysql2

const { v4: uuidv4 } = require('uuid');

const orderS3Prefix = "orders/";

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
        else if (event.resource == "/order/{orderId}" || event.resource == "/order/{orderId}/presignedPost") {
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
            else if (event.resource == "/order/{orderId}/presignedPost") {
                if (event.httpMethod == "POST") {
                    // The main reason to use this logic instead of directly pass STS token back is to restrict file size limit for upload (if need can also do other restriction like file type)
                    // But if the limitation is not needed (i.e. the client frontend is internal app/restrict app that cannot be tempered), 
                    // then may able to pass the STS token back as in GET request and use STS token to perform the upload directly with SDK or generated the presigned post at client side
                    var postObject = await createPresignedPost(orderS3Prefix + order.orderId + "/" + order.s3Prefix);


                    response = {
                        statusCode: 200,
                        headers: responseHeaders,
                        body: JSON.stringify(postObject)
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
                    s3Prefix: "image.png"
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
        'asset': asset
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
    var s3Prefixs = [];

    // Add orders into array, so can be included as part of STS result
    // The prefix assemble is /orders/<orderId>/<s3Prefix in DB> to prevent incorrect/conflict file
    orders.forEach(record => { s3Prefixs.push(orderS3Prefix + record.orderId + "/" + record.s3Prefix); });

    var asset = {};

    // Only generated STS token if there is at least one record
    // Do a combine STS token instead of one by one for each record for efficency and avoid error
    // Note there is an upper bound to STS policy, which is why limit the record number in first place
    if (s3Prefixs.length > 0) {
        asset = await getSTSCredential(s3Prefixs, ['s3:GetObject']);
    }

    // Need to assemble a response, one reason is security practice should elimite directly return array (to avoid JSON Hijacking)
    // 
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
        // provider asset (sts token and replated info)
        'asset': asset
    }
};

/**
 * Create a new record into database
 * @param {*} order order object to be inserted with populated field
 */
var createOrder = async function (order) {

    if (!order.orderId || !order.description || !order.s3Prefix) {
        throw 'new object does not have required fields';
    }

    await createOrderDB(order);
};

/**
 * Update an existing record in DB
 * @param {*} orderId Order ID for record to be updated
 */
var getOrderByOrderId = async function (orderId) {
    var order = await getOrderByOrderIdDB(orderId);

    if (order) {
        // Generate the S3 credential on field asset
        order['asset'] = await getSTSCredential([orderS3Prefix + order.orderId + "/" + order.s3Prefix], ['s3:GetObject']);
    }

    return order;
};

/**
 * Update an existing record in DB
 * @param {*} order Order object to be updated
 */
var updateOrderByOrderId = async function (order) {
    if (!order.orderId || !order.description || !order.s3Prefix) {
        throw 'updated object does not have required fields';
    }

    await updateOrderByOrderIdDB(order);
};

/**
 * Delete an existing order record in S3 and DB
 * @param {*} order Order object to be updated
 */
var deleteOrderByOrderId = async function (order) {

    await deleteS3Asset(orderS3Prefix + order.orderId + "/" + order.s3Prefix);

    await deleteOrderByOrderIdDB(order.orderId);
};

/**
 * Create a post signed url with preset file size limit
 * @param {*} s3Preix 
 */
var createPresignedPost = async function (s3Preix) {
    // In this case, use the STS token
    // The reason is to ensure no matter how the down stream is created/handle
    // The STS token is the longest expiration time setup
    var stsCredential = await getSTSCredential([s3Preix], ['s3:GetObject', 's3:PutObject']);

    // Region must be specified, otherwise will cause CORS error when using generated presigned post info
    var tempS3parameters = {
        accessKeyId: stsCredential.sts.Credentials.AccessKeyId,
        secretAccessKey: stsCredential.sts.Credentials.secretAccessKey,
        sessionToken: stsCredential.sts.Credentials.SessionToken,
        maxRetries: 3,
        signatureVersion: "v4",
        region: stsCredential.region
    }

    const tempS3 = await new AWS.S3(tempS3parameters);

    // Get url as signed url to able to download as browser (or directly download link)
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#createPresignedPost-property
    // Default expire will be the STS token maximize

    // Content length range limit to 0 to 10 MB
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html
    var params = {
        Bucket: stsCredential.bucket,
        Expires : 600, // Set to 10 minutes for upload (the upper limit will be cap by STS token lifetime, which is 15 min in this sample, doc detail in https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectpresignedURL.html)
        Fields: {
            key: s3Preix
        },
        Conditions: [
            ["content-length-range", 0, 10485760]
        ]
    };

    return await new Promise(function (resolve, reject) {
        tempS3.createPresignedPost(params, function (err, data) {
            if (err) {
                console.error('Presigning post data encountered an error', err);
                reject(err);
            } else {
                resolve(data);
            }
        });
    });

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
 * Delete target file in S3 based on inputted s3 prefix, throw error if deletion error
 * @param {*} s3Preix - s3Prefix to be deleted
 */
var deleteS3Asset = async function (s3Preix) {
    var params = {
        Bucket: process.env.BUCKET.replace('arn:aws:s3:::', ''),
        Key: s3Preix
    };

    try {

        // Need to check if file exist before deletion, otherwise deleteObject promise will stuck as s3 will not return error/success for non existing object
        await S3.headObject(params).promise();

        console.log("COMPLETE HEAD, MOVE TO DELETE");

        await S3.deleteObject(params).promise();
    }
    catch (error) {

        console.log("ERROR IN HEADOBJECT");

        // Forbidden will be shown for object not exist in this case, as the S3 assume role generated do not have s3:ListBucket permission
        // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#headObject-property
        // If you have the s3:ListBucket permission on the bucket, Amazon S3 returns an HTTP status code 404 ("no such key") error.
        // If you don’t have the s3:ListBucket permission, Amazon S3 returns an HTTP status code 403 ("access denied") error.
        if (error.code != 'NotFound' && error.code != 'Forbidden') {
            // Print error out as not expected
            throw error;
        }
    }
}

/**
 * 
 * @param {*} s3Preixs - Array of s3 prefix to generate STS token, the full bucket will be append within method, only need prefix portion. Examlpe is ['test1/image.png', 'test2/image.png'] 
 * @param {*} s3Actions - Array of s3 actions to generate STS token. Examlpe is ['s3:GetObject'] or  ['s3:GetObject', 's3:PutObject']
 * @returns 
 */
var getSTSCredential = async function (s3Preixs, s3Actions) {
    // Create an inline policy to restrict access
    // The result temporary credential is an interaction of this policy and the base template's policy
    // So this retrict policy will limit the previliges the final token can access
    // Need to explictly call out S3 prefix + KMS key (without KMS key portion will fail as this example's S3 bucket is encrypted with KMS)

    var resources = [];

    // Append the bucket to each prefix to become complete ARN
    s3Preixs.forEach(prefix => resources.push(process.env.BUCKET + "/" + prefix));

    // Reference https://aws.amazon.com/premiumsupport/knowledge-center/s3-bucket-access-default-encryption/
    const policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Sid": "InlineAssumeRoleS3Policy",
            "Effect": "Allow",
            "Action": s3Actions,
            "Resource": resources
        },
        {
            "Sid": "InlineAssumeRoleKMSPolicy",
            "Effect": "Allow",
            "Action": [
                'kms:Decrypt',
                'kms:GenerateDataKey'
            ],
            "Resource": process.env.BUCKET_ENCRYPTION
        }]
    };

    // Session token retriving
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/STS.html#assumeRole-property
    // async/await.
    var params = {
        ExternalId: "WebSiteRetrieveRequest",
        Policy: JSON.stringify(policy),
        RoleArn: process.env.TEMPLATE_IAM_ROLE,
        RoleSessionName: "WebSiteAssumeRoleSession",
        DurationSeconds: process.env.TOKEN_DURATION_SECONDS          // Specify a low duration to enforce to retrieve new token
    };

    var tempCredential = await STS.assumeRole(params).promise();

    // Important note: the key at presigned prefix generation does not include the / after bucket
    // So if the full path is s3://test/key1/key.file
    // Bucket: test
    // key: key1/key.file
    // If using key as 
    // key: /key1/key.file
    // Will result presigned url with //key1/key.file and permission error

    // sts the region by choosing the lambda's region
    var asset = {
        sts: tempCredential,
        region: process.env.AWS_REGION,
        bucket: process.env.BUCKET.replace('arn:aws:s3:::', ''),    // Clean up the ARN to only have bucket name for client side setup
    }

    return asset;
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
        dbConnection.query('SELECT * FROM `' + process.env.AURORA_TABLE_NAME + '` ORDER BY `order_id` LIMIT ? OFFSET ?;', [limit, offset], function (error, results, fields) {
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
        dbConnection.query('SELECT * FROM `' + process.env.AURORA_TABLE_NAME + '` WHERE `order_id` = ?;', [orderId], function (error, results, fields) {
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
 * @param {*} order object to be inserted
 */
var createOrderDB = async function (order) {
    return new Promise(function (resolve, reject) {
        dbConnection.query('INSERT INTO `' + process.env.AURORA_TABLE_NAME + '` (`order_id`, `description`, `s3_prefix`) VALUES(?, ?, ?);', [order.orderId, order.description, order.s3Prefix], function (error, results, fields) {
            if (error) {
                //throw error
                reject("ERROR " + error);
            }

            resolve();
        });
    });
};

/**
 * Update an existing record in DB
 * @param {*} order order object to be updated based on orderId
 */
var updateOrderByOrderIdDB = async function (order) {
    return new Promise(function (resolve, reject) {
        dbConnection.query('UPDATE `' + process.env.AURORA_TABLE_NAME + '` SET `description` = ?, `s3_prefix` = ? WHERE `order_id` = ?;', [order.description, order.s3Prefix, order.orderId], function (error, results, fields) {
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
        's3Prefix': row['s3_prefix'],
    };
};
