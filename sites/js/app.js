var global = this; // in global scope.

// Global variable for constant (not use const as only var can be global in ES2015)
var signInURL = ''
var orderEndpoint = ''
var orderrdbmsblobEndpoint = ''

var userToken = {
    id_token: "",
    access_token: "",
    expires_in: "",
    token_type: "",
};

var validateToken = async function () {
    // If token is not null and is still not expire
    if (global.userToken != "" && global.userToken.expires_in && global.userToken.expires_in > Date.now()) {
        return true;
    }
    else {
        if (global.userToken != "" && global.userToken.expires_in && global.userToken.expires_in < Date.now()) {
            populateMessage('CREDENTIAL IS EXPIRED, PLEASE LOGIN AT <a href="' + global.signInURL + '">LOGIN</a>')
        }

        return false;
    }
}

var getAccessTokenForMFA = async function () {
    var html = "<div>" + global.userToken.access_token + "</div>";
    document.getElementById('mfa').innerHTML = html;
}

var getIDTokenForTest = async function () {
    var html = "<div>" + global.userToken.id_token + "</div>";
    document.getElementById('idToken').innerHTML = html;
}


var extractToken = async function () {

    // Try to check url if this is new login request
    let parsedUrl = new URL(window.location.href);

    // Search for query, the returned query is in hash, so retrieve from hash, and replace hash with empty to proerly query it
    let searchParams = new URLSearchParams(parsedUrl.hash.replace('#', ''));

    let retrivedKeys = ['id_token', 'expires_in', 'token_type', 'access_token'];

    if (searchParams.has(retrivedKeys[0]) && searchParams.has(retrivedKeys[1]) && searchParams.has(retrivedKeys[2])) {

        // Set token into javascript object
        global.userToken.id_token = searchParams.get(retrivedKeys[0]);

        // Minus 300 (5 min) to prevent the problem where token expire in that exact minute or during operation
        // So force token refresh 5 min before actual expire time
        // * 1000 to translate the second to millisecond (as Date.now is millisecond)
        global.userToken.expires_in = Date.now() + ((searchParams.get(retrivedKeys[1]) - 300) * 1000);

        global.userToken.token_type = searchParams.get(retrivedKeys[2]);

        global.userToken.access_token = searchParams.get(retrivedKeys[3]);

        // Clean up the url to prevent query
        window.history.pushState({}, document.title, "/");
    }

    if (! await validateToken()) {
        // If still not, force to login page
        window.location.replace(global.signInURL);
    }
}
var clearCreateOrderUI = async function () {

    var orderDiv = document.getElementById('order');
    orderDiv.textContent = '';

    var createOrderButton = document.createElement("input");
    createOrderButton.type = "button";
    createOrderButton.id = "initCreateOrderUIButton";
    createOrderButton.value = "Create Order";
    createOrderButton.addEventListener("click", initCreateOrderUI.bind(null));
    orderDiv.append(createOrderButton);

}

var initCreateOrderUI = async function () {
    await clearCreateOrderUI();

    var orderDiv = document.getElementById('order');

    orderDiv.textContent = '';

    var title = document.createElement('div');
    title.textContent = 'New Order';
    orderDiv.appendChild(title);

    orderDiv.appendChild(document.createElement('br'));

    var descriptionDiv = document.createElement('div');

    var description = document.createElement('p');
    description.textContent = 'Description: ';
    descriptionDiv.appendChild(description);

    var descriptionTextField = document.createElement('input');
    descriptionTextField.id = "description_field_order_new";
    descriptionTextField.type = "text";
    descriptionTextField.value = "New Order Description"
    descriptionDiv.appendChild(descriptionTextField);

    orderDiv.appendChild(descriptionDiv);

    orderDiv.appendChild(document.createElement('br'));

    var uploadDiv = document.createElement('div');

    var uploadAssetFileLabel = document.createElement('label');
    uploadAssetFileLabel.for = "file";
    uploadAssetFileLabel.textContent = "Choose file to upload"
    uploadDiv.appendChild(uploadAssetFileLabel);

    var uploadAssetFile = document.createElement('input');
    uploadAssetFile.id = "uploadAssetFile_new";
    uploadAssetFile.type = "file";
    uploadAssetFile.accept = ".png";
    uploadDiv.appendChild(uploadAssetFile);

    orderDiv.appendChild(uploadDiv);

    orderDiv.appendChild(document.createElement('br'));

    var createNewOrderDiv = document.createElement('div');
    var createNewOrderButton = document.createElement('input');
    createNewOrderButton.id = "createOrderButton";
    createNewOrderButton.value = "Create Order"
    createNewOrderButton.type = "button";
    createNewOrderButton.addEventListener("click", createOrder.bind(null));
    createNewOrderDiv.appendChild(createNewOrderButton);

    orderDiv.appendChild(createNewOrderDiv);
    orderDiv.appendChild(document.createElement('br'));

    var cancelNewOrderDiv = document.createElement('div');
    var cancelNewOrderButton = document.createElement('input');
    cancelNewOrderButton.id = "clearCreateOrderUIButton";
    cancelNewOrderButton.value = "Cancel New Order"
    cancelNewOrderButton.type = "button";
    cancelNewOrderButton.addEventListener("click", clearCreateOrderUI.bind(null));
    cancelNewOrderDiv.appendChild(cancelNewOrderButton);

    orderDiv.appendChild(cancelNewOrderDiv);
    orderDiv.appendChild(document.createElement('br'));
}

/**
 * Get order based on given order Id
 * @param {*} orderId order ID to be updated
 */
var createOrder = async function () {
    if (! await validateToken()) {
        return;
    }

    if (!document.getElementById('description_field_order_new') || !document.getElementById('description_field_order_new').value) {
        populateMessage('DESCRIPTION SHOULD NOT BE EMPTY FOR NEW ORDER');
        return;
    }

    if (!document.getElementById('uploadAssetFile_new').files || !document.getElementById('uploadAssetFile_new').files[0]) {
        populateMessage('PLEASE SELECT FILE TO UPLOAD ASSET FOR NEW ORDER');
        return;
    }


    var input = {
        "description": document.getElementById('description_field_order_new').value
    };

    // Create order
    var order = null;
    try {
        order = await new Promise(function (resolve, reject) {
            fetch(global.orderEndpoint + 'order', {
                method: 'POST',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': global.userToken.token_type + ' ' + global.userToken.id_token
                },
                body: JSON.stringify(input)
            })
                .then(response => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.json());
                    }
                    else {
                        console.log('SERVER ERROR: ' + response.status);
                        reject(response.body);
                    }
                }).catch(error => {
                    reject(error);
                });
        });


        // Inject order to top of list
        var orderDiv = document.createElement('div');
        orderDiv.id = "order_" + order.orderId + "";

        // Prepend top of record
        document.getElementById('orders').prepend(orderDiv);

        await populateOrder(orderDiv, order, order.asset);

        await populateMessage('NEW ORDER CREATED ORDER ' + order.orderId + '. NOW UPLOADING ASSET');

        // Assign the files chooen to newly injected field, so can recycle the upload asset code
        document.getElementById('uploadAssetFile_' + order.orderId).files = document.getElementById('uploadAssetFile_new').files;

        // Clear the UI
        await clearCreateOrderUI();

        await uploadAsset(order.orderId, "uploadAssetFile_" + order.orderId);

        populateMessage('CREATION FOR NEW ORDER ' + order.orderId + ' NOW COMPLETE');

    }
    catch (error) {
        order = null;
        populateMessage('ERROR IN GETTING ALL ORDERS WITH ERROR' + error);
    }
}


var getAllOrders = async function (offset) {
    if (! await validateToken()) {
        return;
    }

    // Use fetch API to retrieve user info from API Gateway's endpoint
    var queryParameters = "";

    if (offset) {
        queryParameters = "?offset=" + offset;
    }
    try {
        var response = await new Promise(function (resolve, reject) {
            fetch(global.orderEndpoint + 'orders' + queryParameters, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': global.userToken.token_type + ' ' + global.userToken.id_token
                }
            })
                .then(response => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.json());
                    }
                    else {
                        console.log('SERVER ERROR: ' + response.status);
                        reject(response.body);
                    }
                }).catch(error => {
                    reject(error);
                });
        });


        populateMessage('SUCCESS RETRIVING ORDERS');

        await populateOrders(response, !offset);
    }
    catch (error) {
        populateMessage('ERROR IN GETTING ALL ORDERS WITH ERROR' + error);
    }
}

var clearMessage = async function () {
    var messageDiv = document.getElementById('message');
    messageDiv.textContent = '';
}

var populateMessage = async function (message) {
    await clearMessage();

    var messageDiv = document.getElementById('message');
    messageDiv.textContent = '';

    var tempMessageTextDiv = document.createElement('P');
    tempMessageTextDiv.textContent = message;
    messageDiv.appendChild(tempMessageTextDiv);

    var tempMessageClearButton = document.createElement('input');
    tempMessageClearButton.type = "button";
    tempMessageClearButton.id = "clearMessageButton";
    tempMessageClearButton.value = "Clear Message";
    tempMessageClearButton.addEventListener("click", clearMessage.bind(null));
    messageDiv.appendChild(tempMessageClearButton);

    messageDiv.appendChild(document.createElement('br'));
}

/**
 * Get order based on given order Id
 * @param {*} orderId order ID to be updated
 * @return true/false on whatever the upload success
 */
var uploadAsset = async function (orderId, documentId) {
    if (! await validateToken()) {
        return false;
    }

    if (!orderId || !document.getElementById(documentId).files || !document.getElementById(documentId).files[0]) {
        populateMessage('PLEASE SELECT FILE TO UPLOAD ASSET FOR ORDER ' + orderId);
        return false;
    }

    try {
        var response = await new Promise(function (resolve, reject) {
            fetch(global.orderEndpoint + 'order/' + orderId + '/presignedPost', {
                method: 'POST',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': global.userToken.token_type + ' ' + global.userToken.id_token
                }
            })
                .then(response => response.json())
                .then(data => {
                    resolve(data);
                }).catch(error => {
                    reject(error);
                });
        });

        const formData = new FormData();

        for (const [key, value] of Object.entries(response.fields)) {
            formData.append(key, value);
        }

        formData.append('file', document.getElementById(documentId).files[0]);

        await new Promise(function (resolve, reject) {
            fetch(response.url, {
                method: 'POST',
                body: formData
            })
                .then(data => {
                    resolve();
                }).catch(error => {
                    reject(error);
                });
        });

        getOrder(orderId);

        return true;
    }
    catch (error) {
        populateMessage('ERROR IN UPLOADING ASSET FOR ORDER ' + orderId + ' WITH ERROR' + error);
        return false;
    }
}


/**
 * Update order based on given order Id
 */
var updateOrder = async function (orderId) {
    if (! await validateToken()) {
        return;
    }

    if (!document.getElementById('description_field_order_' + orderId) || !document.getElementById('description_field_order_' + orderId).value) {
        populateMessage('DESCRIPTION SHOULD NOT BE EMPTY FOR ' + orderId + ' TO BE UPDATED');
        return;
    }

    var input = {
        "description": document.getElementById('description_field_order_' + orderId).value
    };

    try {
        await new Promise(function (resolve, reject) {
            fetch(global.orderEndpoint + 'order/' + orderId, {
                method: 'PUT',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': global.userToken.token_type + ' ' + global.userToken.id_token
                },
                body: JSON.stringify(input)
            })
                .then(response => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.json());
                    }
                    else {
                        console.log('SERVER ERROR: ' + response.status);
                        reject(response.body);
                    }
                }).catch(error => {
                    reject(error);
                });
        });

        // Check if order is in list, if exist, update it
        if (document.getElementById('order_' + orderId)) {
            getOrder(orderId);
        }

        populateMessage('SUCCESS IN UPDATING ORDER ' + orderId);
    }
    catch (error) {
        populateMessage('ERROR IN GETTING ORDER ' + orderId + ' WITH ERROR' + error);
    }
}

/**
 * Get order based on given order Id
 * @param {*} orderId 
 */
var getOrder = async function (orderId) {
    if (! await validateToken()) {
        return;
    }

    try {
        var order = await new Promise(function (resolve, reject) {
            fetch(global.orderEndpoint + 'order/' + orderId, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': global.userToken.token_type + ' ' + global.userToken.id_token
                }
            })
                .then(response => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.json());
                    }
                    else {
                        console.log('SERVER ERROR: ' + response.status);
                        reject(response.body);
                    }
                }).catch(error => {
                    reject(error);
                });
        });

        // Check if order is in list, if exist, update it
        if (document.getElementById('order_' + orderId)) {
            await populateOrder(document.getElementById('order_' + orderId), order, order.asset);
        }
    }
    catch (error) {
        populateMessage('ERROR IN GETTING ORDER ' + orderId + ' WITH ERROR' + error);
    }
}


/**
 * Delete order
 * @param {*} orderId Delete given order based on input order ID
 */
var deleteOrder = async function (orderId) {
    if (! await validateToken()) {
        return;
    }

    try {
        await new Promise(function (resolve, reject) {
            fetch(global.orderEndpoint + 'order/' + orderId, {
                method: 'DELETE',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': global.userToken.token_type + ' ' + global.userToken.id_token
                }
            })
                .then(response => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve();
                    }
                    else {
                        console.log('SERVER ERROR: ' + response.status);
                        reject(response.body);
                    }
                }).catch(error => {
                    reject(error);
                });
        });

        document.getElementById('order_' + orderId).remove();

        populateMessage('SUCCESS DELETE ORDER ' + orderId);
    }
    catch (error) {
        populateMessage('ERROR IN TRYING TO DELETE ORDER ' + orderId + ' WITH ERROR' + error);
    }
}


var getImageUrlS3 = async function (order, asset) {
    // Generate S3 asset
    // Update local session with the temp object
    AWS.config.update({
        region: asset['region'],
        credentials: new AWS.Credentials({
            accessKeyId: asset['sts']['Credentials']['AccessKeyId'],
            secretAccessKey: asset['sts']['Credentials']['SecretAccessKey'],
            sessionToken: asset['sts']['Credentials']['SessionToken']
        })
    });


    // From
    // https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/s3-example-photos-view-full.html

    // Important note: the key at here does not include the / after bucket
    // So if the full path is s3://test/key1/key.file
    // Bucket: test
    // key: key1/key.file
    // If using key as 
    // key: /key1/key.file
    // Will result presigned url with //key1/key.file and permission error
    var params = {
        Bucket: asset['bucket'],
        Key: 'orders/' + order.orderId + '/' + order['s3Prefix']
    };

    // Need to specify signatureVersion as V4
    // Otherwise generated signed url will error with encrpytion content need signature version v4
    // https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html
    var s3 = new AWS.S3({ maxRetries: 10, signatureVersion: "v4" });

    try {
        // Need to check if file exist before deletion, otherwise deleteObject promise will stuck as s3 will not return error/success for non existing object
        await s3.headObject(params).promise();

        // Set the expiration for presigned URL (need to set after headObject, as this is only for getSignedURL)
        params.Expires = 300; // Set to 5 minutes for download (shorter)  (the upper limit will be cap by STS token lifetime, which is 15 min in this sample from backend, doc detail in https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectpresignedURL.html)

        // Get url as signed url to able to download as browser (or directly download link)
        // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#getSignedUrl-property
        // Default expire is 900 
        return await s3.getSignedUrl('getObject', params);
    }
    catch (error) {
        // Forbidden will be shown for object not exist in this case, as the S3 assume role generated do not have s3:ListBucket permission
        // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#headObject-property
        // If you have the s3:ListBucket permission on the bucket, Amazon S3 returns an HTTP status code 404 ("no such key") error.
        // If you don’t have the s3:ListBucket permission, Amazon S3 returns an HTTP status code 403 ("access denied") error.
        if (error.code != 'NotFound' && error.code != 'Forbidden') {
            // Print error out as not expected
            populateMessage('ERROR IN RETRIVING ASSET FOR ORDER ' + order.orderId + ' WITH ERROR ' + error);
        }

        return null;
    }
}

var populateOrder = async function (orderDiv, order, asset) {

    orderDiv.textContent = '';

    var url = await getImageUrlS3(order, asset);

    var titleDiv = document.createElement('div');
    var title = document.createElement('p');
    title.textContent = 'Order ID : ' + order.orderId + '';
    titleDiv.appendChild(title);

    orderDiv.appendChild(titleDiv);
    orderDiv.appendChild(document.createElement('br'));

    var descriptionDiv = document.createElement('div');
    var description = document.createElement('p');
    description.textContent = 'Description: ';
    descriptionDiv.appendChild(description);

    var descriptionTextField = document.createElement('input');
    descriptionTextField.id = "description_field_order_" + order.orderId + "";
    descriptionTextField.type = "text";
    descriptionTextField.value = order.description;
    descriptionDiv.appendChild(descriptionTextField);

    orderDiv.appendChild(descriptionDiv);
    orderDiv.appendChild(document.createElement('br'));

    var updateOrderButton = document.createElement('input');
    updateOrderButton.id = "updateOrder_" + order.orderId + "_Button";
    updateOrderButton.value = "Update Order"
    updateOrderButton.type = "button";
    updateOrderButton.addEventListener("click", updateOrder.bind(null, order.orderId));
    orderDiv.appendChild(updateOrderButton);

    orderDiv.appendChild(document.createElement('br'));

    // Check if image 
    if (url) {
        var image = document.createElement('img');
        image.src = url;
        image.width = '128';
        image.height = '128';
        orderDiv.appendChild(image);
    }
    else {
        var imagePlaceHolder = document.createElement('p');
        imagePlaceHolder.textContent = 'NO ASSET PRESENT';
        orderDiv.appendChild(imagePlaceHolder);
    }

    orderDiv.appendChild(document.createElement('br'));

    var uploadDiv = document.createElement('div');

    var uploadAssetFileLabel = document.createElement('label');
    uploadAssetFileLabel.for = "file";
    uploadAssetFileLabel.textContent = "Choose file to upload"
    uploadDiv.appendChild(uploadAssetFileLabel);

    var uploadAssetFile = document.createElement('input');
    uploadAssetFile.id = "uploadAssetFile_" + order.orderId + "";
    uploadAssetFile.type = "file";
    uploadAssetFile.accept = ".png";
    uploadDiv.appendChild(uploadAssetFile);

    var uploadAssetButton = document.createElement('input');
    uploadAssetButton.id = "uploadAsset_" + order.orderId + "_Button";
    uploadAssetButton.type = "button";
    uploadAssetButton.value = "Upload Asset";
    uploadAssetButton.addEventListener("click", uploadAsset.bind(null, order.orderId, "uploadAssetFile_" + order.orderId));
    uploadDiv.appendChild(uploadAssetButton);

    orderDiv.appendChild(uploadDiv);
    orderDiv.appendChild(document.createElement('br'));

    var getOrderButton = document.createElement('input');
    getOrderButton.id = "getOrder_" + order.orderId + "_Button";
    getOrderButton.value = "Get Latet Order Info"
    getOrderButton.type = "button";
    getOrderButton.addEventListener("click", getOrder.bind(null, order.orderId));
    orderDiv.appendChild(getOrderButton);

    orderDiv.appendChild(document.createElement('br'));

    var deleteOrderButton = document.createElement('input');
    deleteOrderButton.id = "deleteOrder_" + order.orderId + "_Button";
    deleteOrderButton.value = "Delete Order"
    deleteOrderButton.type = "button";
    deleteOrderButton.addEventListener("click", deleteOrder.bind(null, order.orderId));
    orderDiv.appendChild(deleteOrderButton);

    orderDiv.appendChild(document.createElement('br'));
}

var populateOrders = async function (ordersResponse, clearContent) {

    var ordersDiv = document.getElementById('orders');

    // Clear content if needed
    if (clearContent) {
        ordersDiv.textContent = '';
    }

    for (var index = 0; index < ordersResponse.orders.length; index++) {
        // Append to record
        var orderDiv = document.createElement('div');
        orderDiv.id = "order_" + ordersResponse.orders[index].orderId + "";
        ordersDiv.appendChild(orderDiv);

        await populateOrder(orderDiv, ordersResponse.orders[index], ordersResponse.asset);
    }

    var ordersAdditionalDiv = document.getElementById("orders_additional");
    ordersAdditionalDiv.textContent = '';

    // If current offset + retrived records are small than total count, enable a button to retrieve records
    if (ordersResponse.offset + ordersResponse.orders.length < ordersResponse.ordersCount) {
        var getMoreOrdersButton = document.createElement("input");
        getMoreOrdersButton.id = "getMoreOrdersButton";
        getMoreOrdersButton.type = "button";
        getMoreOrdersButton.value = "Get Additional Orders";
        getMoreOrdersButton.addEventListener("click", getAllOrders.bind(null, (ordersResponse.offset + ordersResponse.orders.length)));
        ordersAdditionalDiv.appendChild(getMoreOrdersButton);
    }
}

var initApp = async function () {
    try {
        var response = await new Promise(function (resolve, reject) {
            fetch('config.json', {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': global.userToken.token_type + ' ' + global.userToken.id_token
                }
            })
                .then(response => response.json())
                .then(data => {
                    resolve(data);
                }).catch(error => {
                    console.log(error);
                    reject('ERROR IN GETTING ALL ORDERS WITH ERRORS ' + error);
                });
        });

        if (!response.signInURL || response.signInURL.trim() == '' ||
            !response.orderEndpoint || response.orderEndpoint.trim() == '' ||
            !response.orderrdbmsblobEndpoint || response.orderrdbmsblobEndpoint.trim() == '') {
            throw error('CONFIG FILE PROPERTY signInURL, orderEndpoint, orderrdbmsblobEndpoint  ARE EITHER NOT DEFINED OR ARE EMPTY');
        }

        // Set the sign in url and config
        global.signInURL = response.signInURL.trim();
        global.orderEndpoint = response.orderEndpoint.trim();
        global.orderrdbmsblobEndpoint = response.orderrdbmsblobEndpoint.trim();

        await constructLogout();

        extractToken();
    }
    catch (error) {
        populateMessage('ERROR IN INIT APP CONFIG WITH ERROR' + error);
    }
}

var constructLogout = async function () {
    var signInURL = new URL(global.signInURL);

    // Use sign in url as base
    const logoutURL = new URL(global.signInURL);
    // Append logout path https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html
    logoutURL.pathname = 'logout'

    // Delete all search fields, as not sure if there will be new fields, so use foreach
    signInURL.searchParams.forEach(function (value, key) {
        logoutURL.searchParams.delete(key);
    });

    logoutURL.searchParams.append('client_id', signInURL.searchParams.get('client_id'));
    logoutURL.searchParams.append('logout_uri', signInURL.searchParams.get('redirect_uri'));

    var logoutButtonDiv = document.getElementById("logoutButtonDiv");
    logoutButtonDiv.textContent = '';

    var logoutsButton = document.createElement("input");
    logoutsButton.id = "logoutButton";
    logoutsButton.type = "button";
    logoutsButton.value = "Logout";
    logoutsButton.addEventListener("click", function() {
        window.location = logoutURL.href;
    });
    logoutButtonDiv.appendChild(logoutsButton);
}

// Trigger script loading
document.addEventListener("DOMContentLoaded", function () {
    // Init button action
    document.getElementById("getAccessTokenForMFAButton").addEventListener("click", getAccessTokenForMFA.bind(null));
    document.getElementById("getIDTokenForTestButton").addEventListener("click", getIDTokenForTest.bind(null));

    document.getElementById("initCreateOrderUIButton").addEventListener("click", initCreateOrderUI.bind(null));
    document.getElementById("getAllOrdersButton").addEventListener("click", getAllOrders.bind(null, null));

    document.getElementById("initCreateOrderUIRDBMSButton").addEventListener("click", initCreateOrderUIRDBMS.bind(null));
    document.getElementById("getAllOrdersRDBMSButton").addEventListener("click", getAllOrdersRDBMS.bind(null, null));

    document.getElementById("searchOrderBridgeButton").addEventListener("click", searchOrderBridge.bind(null));

    initApp();
});