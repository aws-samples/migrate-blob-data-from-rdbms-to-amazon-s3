var searchOrderBridge = async function () {
    if (!document.getElementById('order_bridge_search_orderId') || !document.getElementById('order_bridge_search_orderId').value || !document.getElementById('order_bridge_search_orderId').value.trim().length != 0) {
        populateMessage('SEARCH ORDER ID SHOULD NOT BE EMPTY');
        return;
    }

    var orderId = document.getElementById('order_bridge_search_orderId').value.trim();

    // First try search S3 API
    await getOrderBridge(orderId, true);

    // If the order is not populated yet, so will need to be in other API
    if (!document.getElementById('order_bridge_'+ orderId)) {
        // First try search S3 API
        await getOrderBridge(orderId, false);
    }
}

/**
 * Update order based on given order Id
 */
var updateOrderBridge = async function (orderId, orderS3BlobAPI) {
    if (! await validateToken()) {
        return;
    }

    if (!document.getElementById('description_field_order_bridge_' + orderId) || !document.getElementById('description_field_order_bridge_' + orderId).value) {
        populateMessage('DESCRIPTION SHOULD NOT BE EMPTY FOR ' + orderId + ' TO BE UPDATED');
        return;
    }

    var input = {
        "description": document.getElementById('description_field_order_bridge_' + orderId).value
    };

    var targetUrl = global.orderEndpoint;

    // Use rdbms API if order is S3 API
    if (!orderS3BlobAPI) {
        targetUrl = global.orderrdbmsblobEndpoint;
    }

    try {
        await new Promise(function (resolve, reject) {
            fetch(targetUrl + 'order/' + orderId, {
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

        await getOrderBridge(orderId, orderS3BlobAPI);

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
var getOrderBridge = async function (orderId, orderS3BlobAPI) {
    if (! await validateToken()) {
        return;
    }
    
    // Empty out previous search result
    document.getElementById('order_bridge').textContent = "";

    var targetUrl = global.orderEndpoint;

    // Use rdbms API if order is S3 API
    if (!orderS3BlobAPI) {
        targetUrl = global.orderrdbmsblobEndpoint;
    }

    try {
        var order = await new Promise(function (resolve, reject) {
            fetch(targetUrl + 'order/' + orderId, {
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

        // Inject into div as the current UI for bridge will only get one record
        var orderBridgeDiv = document.createElement("div");
        orderBridgeDiv.id = 'order_bridge_' + orderId;
        document.getElementById('order_bridge').appendChild(orderBridgeDiv);

        await populateOrderBridge(orderBridgeDiv, order, orderS3BlobAPI);
    }
    catch (error) {
        populateMessage('ERROR IN GETTING ORDER ' + orderId + ' WITH ERROR' + error);
    }
}

var uploadAssetBridge = async function (orderId, isOrderS3BlobAPI, documentId) {
    // Use rdbms API if order is S3 API

    var uploadSuccess = false;
    if (isOrderS3BlobAPI) {
        uploadSuccess = await uploadAsset(orderId, documentId);
    }
    else {
        uploadSuccess = await uploadAssetRDBMS(orderId, documentId);
    }

    if (uploadSuccess) {
        // reload UI
        getOrderBridge(orderId, isOrderS3BlobAPI);
    }
}

/**
 * Delete order
 * @param {*} orderId Delete given order based on input order ID
 */
var deleteOrderBridge = async function (orderId, orderS3BlobAPI) {
    if (! await validateToken()) {
        return;
    }

    var targetUrl = global.orderEndpoint;

    // Use rdbms API if order is S3 API
    if (!orderS3BlobAPI) {
        targetUrl = global.orderrdbmsblobEndpoint;

        // If not S3, then need to clean up the local objectURL used to store the image blob from RDBMS Blob API
        // Clear the local object cache for image
        await clearObjectURLCacheEntry(orderId);
    }

    try {
        await new Promise(function (resolve, reject) {
            fetch(targetUrl + 'order/' + orderId, {
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

        if (document.getElementById('order_bridge_' + orderId)) {
            document.getElementById('order_bridge_' + orderId).remove();
        }

        populateMessage('SUCCESS DELETE ORDER ' + orderId);
    }
    catch (error) {
        populateMessage('ERROR IN TRYING TO DELETE ORDER ' + orderId + ' WITH ERROR' + error);
    }
}


var populateOrderBridge = async function (orderDiv, order, orderS3BlobAPI) {
    
    orderDiv.textContent = '';

    var url = null;

    if (orderS3BlobAPI) {
        url = await getImageUrlS3(order, order.asset);
    }
    else {
        url = await getImageUrlRDBMS(order);
    }

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
    descriptionTextField.id = "description_field_order_bridge_" + order.orderId + "";
    descriptionTextField.type = "text";
    descriptionTextField.value = order.description;
    descriptionDiv.appendChild(descriptionTextField);

    orderDiv.appendChild(descriptionDiv);
    orderDiv.appendChild(document.createElement('br'));

    var updateOrderButton = document.createElement('input');
    updateOrderButton.id = "updateOrderBridge_" + order.orderId + "_Button";
    updateOrderButton.value = "Update Order"
    updateOrderButton.type = "button";
    updateOrderButton.addEventListener("click", updateOrderBridge.bind(null, order.orderId, orderS3BlobAPI));
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
    uploadAssetFile.id = "uploadAssetFile_bridge_" + order.orderId;
    uploadAssetFile.type = "file";
    uploadAssetFile.accept = ".png";
    uploadDiv.appendChild(uploadAssetFile);

    var uploadAssetButton = document.createElement('input');
    uploadAssetButton.id = "uploadAssetFileBridge_" + order.orderId + "_Button";
    uploadAssetButton.type = "button";
    uploadAssetButton.value = "Upload Asset";
    uploadAssetButton.addEventListener("click", uploadAssetBridge.bind(null, order.orderId, orderS3BlobAPI, "uploadAssetFile_bridge_" + order.orderId));
    uploadDiv.appendChild(uploadAssetButton);

    orderDiv.appendChild(uploadDiv);
    orderDiv.appendChild(document.createElement('br'));

    var getOrderButton = document.createElement('input');
    getOrderButton.id = "getOrderBridge_" + order.orderId + "_Button";
    getOrderButton.value = "Get Latet Order Info"
    getOrderButton.type = "button";
    getOrderButton.addEventListener("click", getOrderBridge.bind(null, order.orderId, orderS3BlobAPI));
    orderDiv.appendChild(getOrderButton);

    orderDiv.appendChild(document.createElement('br'));

    var deleteOrderButton = document.createElement('input');
    deleteOrderButton.id = "deleteOrderBridge_" + order.orderId + "_Button";
    deleteOrderButton.value = "Delete Order"
    deleteOrderButton.type = "button";
    deleteOrderButton.addEventListener("click", deleteOrderBridge.bind(null, order.orderId, orderS3BlobAPI));
    orderDiv.appendChild(deleteOrderButton);

    orderDiv.appendChild(document.createElement('br'));
}
