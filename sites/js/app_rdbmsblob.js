// This map is used to track the object url so can revoke when needed
// The reason for this mechanism is due to the RDMBS Blob API in this example is protected by Header Authorization instead of cookie
// So normal img src tag will not work and require to fetch the image and store as URL.createObjectURL to reference within image tag
// But URL.createObjectURL will not clean on its own, so need to be manually clean up when no longer needed
var assetObjectURLCache = new Map();

var clearCreateOrderUIRDBMS = async function () {
    var orderDiv = document.getElementById('order_rdbms');
    orderDiv.textContent = '';

    var createOrderButton = document.createElement("input");
    createOrderButton.type = "button";
    createOrderButton.id = "clearCreateOrderUIRDBMSButton";
    createOrderButton.value = "Create Order";
    createOrderButton.addEventListener("click", initCreateOrderUIRDBMS.bind(null));
    orderDiv.append(createOrderButton);
}

var initCreateOrderUIRDBMS = async function () {
    await clearCreateOrderUIRDBMS();

    var orderDiv = document.getElementById('order_rdbms');

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
    descriptionTextField.id = "description_field_order_rdbms_new";
    descriptionTextField.type = "text";
    descriptionTextField.value = "New Order RDBMS Des"
    descriptionDiv.appendChild(descriptionTextField);

    orderDiv.appendChild(descriptionDiv);

    orderDiv.appendChild(document.createElement('br'));

    var uploadDiv = document.createElement('div');

    var uploadAssetFileLabel = document.createElement('label');
    uploadAssetFileLabel.for = "file";
    uploadAssetFileLabel.textContent = "Choose file to upload"
    uploadDiv.appendChild(uploadAssetFileLabel);

    var uploadAssetFile = document.createElement('input');
    uploadAssetFile.id = "uploadAssetFile_rdbms_new";
    uploadAssetFile.type = "file";
    uploadAssetFile.accept = ".png";
    uploadDiv.appendChild(uploadAssetFile);

    orderDiv.appendChild(uploadDiv);

    orderDiv.appendChild(document.createElement('br'));

    var createNewOrderDiv = document.createElement('div');
    var createNewOrderButton = document.createElement('input');
    createNewOrderButton.id = "createOrderRDBMSButton";
    createNewOrderButton.value = "Create Order"
    createNewOrderButton.type = "button";
    createNewOrderButton.addEventListener("click", createOrderRDBMS.bind(null));
    createNewOrderDiv.appendChild(createNewOrderButton);

    orderDiv.appendChild(createNewOrderDiv);
    orderDiv.appendChild(document.createElement('br'));

    var cancelNewOrderDiv = document.createElement('div');
    var cancelNewOrderButton = document.createElement('input');
    cancelNewOrderButton.id = "clearCreateOrderUIRDBMSButton";
    cancelNewOrderButton.value = "Cancel New Order"
    cancelNewOrderButton.type = "button";
    cancelNewOrderButton.addEventListener("click", clearCreateOrderUIRDBMS.bind(null));
    cancelNewOrderDiv.appendChild(cancelNewOrderButton);

    orderDiv.appendChild(cancelNewOrderDiv);
    orderDiv.appendChild(document.createElement('br'));

}

/**
 * Set blob for objectURL cache entry
 * @param {*} orderId target order Id to be set
 * @param {*} blobURL target blobto be stored
 */
var setObjectURLCacheEntry = async function (orderId, blobURL) {
    // First clear old entry if one exist
    await clearObjectURLCacheEntry(orderId);
    // Then update the cache
    global.assetObjectURLCache.set(orderId, blobURL);
}

/**
 * Clear all object url cache entries
 */
var clearAllObjectURLCacheEntries = async function () {
    for (var [key, value] of global.assetObjectURLCache) {
        URL.revokeObjectURL(value);

        global.assetObjectURLCache.delete(key);
    }
}

/**
 * Clear given ObjectURL with orderId in cache if exist
 * @param {*} orderId 
 */
var clearObjectURLCacheEntry = async function (orderId) {
    if (global.assetObjectURLCache.has(orderId)) {
        // Clean up the object and delete the cache entry
        URL.revokeObjectURL(global.assetObjectURLCache.get(orderId));
        global.assetObjectURLCache.delete(orderId);
    }
}

/**
 * Get order based on given order Id
 * @param {*} orderId order ID to be updated
 */
var createOrderRDBMS = async function () {
    if (! await validateToken()) {
        return;
    }

    if (!document.getElementById('description_field_order_rdbms_new') || !document.getElementById('description_field_order_rdbms_new').value) {
        populateMessage('DESCRIPTION SHOULD NOT BE EMPTY FOR NEW ORDER');
        return;
    }

    if (!document.getElementById('uploadAssetFile_rdbms_new').files || !document.getElementById('uploadAssetFile_rdbms_new').files[0]) {
        populateMessage('PLEASE SELECT FILE TO UPLOAD ASSET FOR NEW ORDER');
        return;
    }


    var input = {
        "description": document.getElementById('description_field_order_rdbms_new').value
    };

    // Create order
    try {
        var order = await new Promise(function (resolve, reject) {
            fetch(global.orderrdbmsblobEndpoint + 'order', {
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
        orderDiv.id = "order_rdbms_" + order.orderId + "";

        // Prepend top of record
        document.getElementById('orders_rdbms').prepend(orderDiv);

        await populateOrderRDBMS(orderDiv, order);

        await populateMessage('NEW ORDER CREATED ORDER ' + order.orderId + '. NOW UPLOADING ASSET');

        // Assign the files chooen to newly injected field, so can recycle the upload asset code
        document.getElementById('uploadAssetFile_rdbms_' + order.orderId).files = document.getElementById('uploadAssetFile_rdbms_new').files;

        // Clear the UI
        await clearCreateOrderUIRDBMS();

        await uploadAssetRDBMS(order.orderId, "uploadAssetFile_rdbms_" + order.orderId);

        populateMessage('CREATION FOR NEW ORDER ' + order.orderId + ' COMPLETE');
    }
    catch (error) {
        order = null;
        populateMessage('ERROR IN GETTING ALL ORDERS WITH ERROR' + error);
    }
}


var getAllOrdersRDBMS = async function (offset) {
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
            fetch(global.orderrdbmsblobEndpoint + 'orders' + queryParameters, {
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

        await populateOrdersRDBMS(response, !offset);
    }
    catch (error) {
        populateMessage('ERROR IN GETTING ALL ORDERS WITH ERROR' + error);
    }
}

/**
 * Get order based on given order Id
 * @param {*} orderId order ID to be updated
 * @return true/false on whatever the upload success
 */
var uploadAssetRDBMS = async function (orderId, documentId) {
    if (! await validateToken()) {
        return false;
    }

    if (!orderId || !document.getElementById(documentId).files || !document.getElementById(documentId).files[0]) {
        populateMessage('PLEASE SELECT FILE TO UPLOAD ASSET FOR ORDER ' + orderId);
        return false;
    }

    try {
        await new Promise(function (resolve, reject) {
            fetch(global.orderrdbmsblobEndpoint + 'order/' + orderId + '/blob', {
                method: 'POST',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'include',
                headers: {
                    'Content-Type': 'image/png',
                    'Authorization': global.userToken.token_type + ' ' + global.userToken.id_token
                },
                body: document.getElementById(documentId).files[0]
            })
                .then(response => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve();
                    }
                    else {
                        reject(response.body);
                    }
                }).catch(error => {
                    reject(error);
                });
        });

        // Refresh the page again with latest blob and info
        getOrderRDBMS(orderId);

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
var updateOrderRDBMS = async function (orderId) {
    if (! await validateToken()) {
        return;
    }

    if (!document.getElementById('description_field_order_rdbms_' + orderId) || !document.getElementById('description_field_order_rdbms_' + orderId).value) {
        populateMessage('DESCRIPTION SHOULD NOT BE EMPTY FOR ' + orderId + ' TO BE UPDATED');
        return;
    }

    var input = {
        "description": document.getElementById('description_field_order_rdbms_' + orderId).value
    };

    try {
        await new Promise(function (resolve, reject) {
            fetch(global.orderrdbmsblobEndpoint + 'order/' + orderId, {
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
        if (document.getElementById('order_rdbms_' + orderId)) {
            getOrderRDBMS(orderId);
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
var getOrderRDBMS = async function (orderId) {
    if (! await validateToken()) {
        return;
    }

    try {
        var order = await new Promise(function (resolve, reject) {
            fetch(global.orderrdbmsblobEndpoint + 'order/' + orderId, {
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
        if (document.getElementById('order_rdbms_' + orderId)) {
            await populateOrderRDBMS(document.getElementById('order_rdbms_' + orderId), order);
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
var deleteOrderRDBMS = async function (orderId) {
    if (! await validateToken()) {
        return;
    }

    // Clear the local object cache for image
    await clearObjectURLCacheEntry(orderId);

    try {
        await new Promise(function (resolve, reject) {
            fetch(global.orderrdbmsblobEndpoint + 'order/' + orderId, {
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

        document.getElementById('order_rdbms_' + orderId).remove();

        populateMessage('SUCCESS DELETE ORDER ' + orderId);
    }
    catch (error) {
        populateMessage('ERROR IN TRYING TO DELETE ORDER ' + orderId + ' WITH ERROR' + error);
    }
}


var getImageUrlRDBMS = async function (order) {
    if (! await validateToken()) {
        return null;
    }

    try {
        var responseBlob = await new Promise(function (resolve, reject) {
            fetch(global.orderrdbmsblobEndpoint + 'order/' + order.orderId + '/blob', {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'include',
                headers: {
                    'Accept': 'image/png',
                    'Content-Type': 'image/png',
                    'Authorization': global.userToken.token_type + ' ' + global.userToken.id_token
                }
            })
                .then(response => {
                    if (response.status >= 200 && response.status < 300) {
                        // return with url for the download blob through URL.createObjectURL
                        resolve(response.blob());
                    }
                    else {
                        console.log('SERVER ERROR: ' + response.message);
                        reject(response.message);
                    }
                }).catch(error => {
                    reject(error);
                });
        });

        var url = URL.createObjectURL(responseBlob);

        // Set the cache for future clean up
        await setObjectURLCacheEntry(order.orderId, url);

        return url;
    }
    catch (error) {
        populateMessage('ERROR IN TRYING TO FETCH ASSET FOR ORDER ' + order.orderId + ' WITH ERROR' + error);
    }
}


var populateOrderRDBMS = async function (orderDiv, order) {
    orderDiv.textContent = '';

    var url = await getImageUrlRDBMS(order);

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
    descriptionTextField.id = "description_field_order_rdbms_" + order.orderId + "";
    descriptionTextField.type = "text";
    descriptionTextField.value = order.description;
    descriptionDiv.appendChild(descriptionTextField);

    orderDiv.appendChild(descriptionDiv);
    orderDiv.appendChild(document.createElement('br'));

    var updateOrderButton = document.createElement('input');
    updateOrderButton.id = "updateOrderRDBMS_" + order.orderId + "_Button";
    updateOrderButton.value = "Update Order"
    updateOrderButton.type = "button";
    updateOrderButton.addEventListener("click", updateOrderRDBMS.bind(null, order.orderId));
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
    uploadAssetFile.id = "uploadAssetFile_rdbms_" + order.orderId;
    uploadAssetFile.type = "file";
    uploadAssetFile.accept = ".png";
    uploadDiv.appendChild(uploadAssetFile);

    var uploadAssetButton = document.createElement('input');
    uploadAssetButton.id = "uploadAssetRDBMS_" + order.orderId + "_Button";
    uploadAssetButton.type = "button";
    uploadAssetButton.value = "Upload Asset";
    uploadAssetButton.addEventListener("click", uploadAssetRDBMS.bind(null, order.orderId, "uploadAssetFile_rdbms_" + order.orderId));
    uploadDiv.appendChild(uploadAssetButton);

    orderDiv.appendChild(uploadDiv);
    orderDiv.appendChild(document.createElement('br'));

    var getOrderButton = document.createElement('input');
    getOrderButton.id = "getOrderRDBMS_" + order.orderId + "_Button";
    getOrderButton.value = "Get Latet Order Info"
    getOrderButton.type = "button";
    getOrderButton.addEventListener("click", getOrderRDBMS.bind(null, order.orderId));
    orderDiv.appendChild(getOrderButton);

    orderDiv.appendChild(document.createElement('br'));

    var deleteOrderButton = document.createElement('input');
    deleteOrderButton.id = "deleteOrderRDBMS_" + order.orderId + "_Button";
    deleteOrderButton.value = "Delete Order"
    deleteOrderButton.type = "button";
    deleteOrderButton.addEventListener("click", deleteOrderRDBMS.bind(null, order.orderId));
    orderDiv.appendChild(deleteOrderButton);

    orderDiv.appendChild(document.createElement('br'));
}

var populateOrdersRDBMS = async function (ordersResponse, clearContent) {
    var ordersDiv = document.getElementById('orders_rdbms');

    if (clearContent) {
        ordersDiv.textContent = '';
    }
    else {
        // If need to clear all contents, also clean up all cache
        await clearAllObjectURLCacheEntries();
    }

    for (var index = 0; index < ordersResponse.orders.length; index++) {
        // Append to record
        var orderDiv = document.createElement('div');
        orderDiv.id = "order_rdbms_" + ordersResponse.orders[index].orderId + "";
        ordersDiv.appendChild(orderDiv);

        await populateOrderRDBMS(orderDiv, ordersResponse.orders[index]);
    }

    var ordersAdditionalDiv = document.getElementById("orders_rdbms_additional");
    ordersAdditionalDiv.textContent = '';

    // If current offset + retrived records are small than total count, enable a button to retrieve records
    if (ordersResponse.offset + ordersResponse.orders.length < ordersResponse.ordersCount) {
        var getMoreOrdersButton = document.createElement("input");
        getMoreOrdersButton.id = "getAllOrdersRDBMSButton";
        getMoreOrdersButton.type = "button";
        getMoreOrdersButton.value = "Get Additional Orders";
        getMoreOrdersButton.addEventListener("click", getAllOrdersRDBMS.bind(null, (ordersResponse.offset + ordersResponse.orders.length)));
        ordersAdditionalDiv.appendChild(getMoreOrdersButton);
    }
}