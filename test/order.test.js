const request = require('supertest');

// Load config instead of changing source file
const config = require('./config.js');

// Increase the timeout of IT test as it will be different depend on region
jest.setTimeout(10000);

const orderAPI = request(config.orderEndpoint);
const token = config.token;

describe('Order API methods', function () {
    it('Orders API methods without token', function (done) {
        orderAPI
            .get('orders')
            .expect(401, done);
    });

    it('Orders API invalid method with token', function (done) {
        orderAPI
            .put('orders')
            .set('Authorization', 'Bearer ' + token)
            .expect(403, done);
    });

    it('Orders API invalid method with token', function (done) {
        orderAPI
            .post('orders')
            .set('Authorization', 'Bearer ' + token)
            .expect(403, done);
    });

    it('Orders API invalid method with token', function (done) {
        orderAPI
            .delete('orders')
            .set('Authorization', 'Bearer ' + token)
            .expect(403, done);
    });

    it('Order post API methods without token', function (done) {
        orderAPI
            .post('order')
            .expect(401, done);
    });

    it('Order post API method with invalid method with token', function (done) {
        orderAPI
            .get('order')
            .set('Authorization', 'Bearer ' + token)
            .expect(403, done);
    });

    it('Orders get API method invalid path with token', function (done) {
        orderAPI
            .get('order/')
            .set('Authorization', 'Bearer ' + token)
            .expect(403, done);
    });

    it('Orders put API method invalid path with token', function (done) {
        orderAPI
            .put('order/')
            .set('Authorization', 'Bearer ' + token)
            .expect(403, done);
    });

    it('Orders delete API method invalid path with token', function (done) {
        orderAPI
            .delete('order/')
            .set('Authorization', 'Bearer ' + token)
            .expect(403, done);
    });


    // Test order specific resource
    var testOrderId = 'testId';

    it('Order get API methods without token', function (done) {
        orderAPI
            .get('order/' + testOrderId)
            .expect(401, done);
    });

    it('Order put API methods without token', function (done) {
        orderAPI
            .put('order/' + testOrderId)
            .expect(401, done);
    });

    it('Order delete API methods without token', function (done) {
        orderAPI
            .delete('order/' + testOrderId)
            .expect(401, done);
    });

    it('Order presignedPost API methods without token', function (done) {
        // Test specific order blob resource
        orderAPI
            .post('order/' + testOrderId + '/presignedPost')
            .expect(401, done);
    });

    it('Order presignedPost invalid API methods test', function (done) {
        // Other random API will be 403 blocked by API Gateway
        orderAPI
            .post('order/' + testOrderId + '/presignedPost1')
            .expect(403, done);

        orderAPI
            .get('order/' + testOrderId + '/presignedPost')
            .expect(403, done);

        orderAPI
            .post('order1/' + testOrderId + '/presignedPost1')
            .expect(403, done);
    });

    
    it('Orders post presignedPost API method invalid path with token', function (done) {
        orderAPI
            .post('order//presignedPost')
            .set('Authorization', 'Bearer ' + token)
            .expect(400, done);
    });

    var offset = 0;
    var initlOrderArrayLength = 0;
    var totalOrder = 0;

    it('Orders API methods with token with no offset', function (done) {
        orderAPI
            .get('orders')
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .send()
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);

                // orders should be an array field
                expect(Array.isArray(res.body.orders)).toBeTruthy();
                // For pagination
                expect(typeof res.body.offset).toBe('number');
                expect(typeof res.body.ordersCount).toBe('number');
                expect(res.body.offset <= res.body.ordersCount).toBeTruthy();

                offset = res.body.offset;
                initlOrderLength = res.body.orders.length;
                totalOrder = res.body.ordersCount;

                return done();
            });
    });


    it('Orders API methods with token with valid offset', function (done) {
        orderAPI
            .get('orders?offset=' + (offset + initlOrderArrayLength))
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .send()
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);

                // orders should be an array field
                expect(Array.isArray(res.body.orders)).toBeTruthy();
                // For pagination
                expect(typeof res.body.offset).toBe('number');
                expect(typeof res.body.ordersCount).toBe('number');

                // The result offset should be equal or less than requested offset ( as it is last pagination)
                expect(res.body.offset >= offset).toBeTruthy();
                expect(res.body.offset <= res.body.ordersCount).toBeTruthy();
                return done();
            });
    });

    it('Orders API methods with token with invalid offset (negative number)', function (done) {
        orderAPI
            .get('orders?offset=-1')
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .send()
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);

                // orders should be an array field
                expect(Array.isArray(res.body.orders)).toBeTruthy();
                // For pagination
                expect(typeof res.body.offset).toBe('number');
                expect(typeof res.body.ordersCount).toBe('number');
                expect(res.body.offset <= res.body.ordersCount).toBeTruthy();

                return done();
            });
    });

    it('Orders API methods with token with invalid offset (bigger than avaliable order number)', function (done) {
        orderAPI
            .get('orders?offset=' + (totalOrder * 10))
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .send()
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);

                // orders should be an array field
                expect(Array.isArray(res.body.orders)).toBeTruthy();
                // For pagination
                expect(typeof res.body.offset).toBe('number');
                expect(typeof res.body.ordersCount).toBe('number');
                expect(res.body.offset <= res.body.ordersCount).toBeTruthy();

                return done();
            });
    });

    it('Orders API methods with token with invalid offset (invalid alpha character)', function (done) {
        orderAPI
            .get('orders?offset=1dscx')
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .send()
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);

                // orders should be an array field
                expect(Array.isArray(res.body.orders)).toBeTruthy();
                // For pagination
                expect(typeof res.body.offset).toBe('number');
                expect(typeof res.body.ordersCount).toBe('number');
                expect(res.body.offset <= res.body.ordersCount).toBeTruthy();

                return done();
            });
    });


    var generatedOrderId = "";
    var originalDescription = 'testapi jtest';
    var modifiedDescription = 'modifiedDescription';
    it('Order create API methods with token with valid body', function (done) {
        orderAPI
            .post('order')
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .send({
                'description': originalDescription
            })
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);

                // orders should be an array field
                // undefined will be type of undefined
                // null will be type of object, so if the field is string, then it will be not null/undefined
                expect(typeof res.body.orderId).toBe('string');
                expect(typeof res.body.description).toBe('string');
                expect(typeof res.body.asset).toBe('object');
                expect(typeof res.body.asset.region).toBe('string');
                expect(typeof res.body.asset.bucket).toBe('string');

                expect(typeof res.body.asset.sts).toBe('object');
                expect(typeof res.body.asset.sts.Credentials.AccessKeyId).toBe('string');
                expect(typeof res.body.asset.sts.Credentials.SecretAccessKey).toBe('string');
                expect(typeof res.body.asset.sts.Credentials.SessionToken).toBe('string');

                generatedOrderId = res.body.orderId

                console.log('generated order ID by test: ' + generatedOrderId);

                return done();
            });
    });


    it('Order get API methods with token', function (done) {
        orderAPI
            .get('order/' + generatedOrderId)
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);

                // orders should be an array field
                // undefined will be type of undefined
                // null will be type of object, so if the field is string, then it will be not null/undefined
                expect(typeof res.body.orderId).toBe('string');
                expect(typeof res.body.description).toBe('string');

                expect(res.body.description).toContain(originalDescription);

                // This update API will not contain asset
                expect(typeof res.body.asset.sts).toBe('object');
                expect(typeof res.body.asset.sts.Credentials.AccessKeyId).toBe('string');
                expect(typeof res.body.asset.sts.Credentials.SecretAccessKey).toBe('string');
                expect(typeof res.body.asset.sts.Credentials.SessionToken).toBe('string');

                return done();
            });
    });

    it('Order get API methods with token (invalid orderId)', function (done) {
        orderAPI
            .get('order/test_' + generatedOrderId)
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .expect(404, done);
    });

    it('Order put API methods with token (valid input)', function (done) {
        orderAPI
            .put('order/' + generatedOrderId)
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .send({
                'description': modifiedDescription
            })
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);

                // orders should be an array field
                // undefined will be type of undefined
                // null will be type of object, so if the field is string, then it will be not null/undefined
                expect(typeof res.body.orderId).toBe('string');
                expect(typeof res.body.description).toBe('string');

                expect(res.body.description).toContain(modifiedDescription);

                // This update API will not contain asset
                expect(typeof res.body.asset.sts).toBe('object');
                expect(typeof res.body.asset.sts.Credentials.AccessKeyId).toBe('string');
                expect(typeof res.body.asset.sts.Credentials.SecretAccessKey).toBe('string');
                expect(typeof res.body.asset.sts.Credentials.SessionToken).toBe('string');

                return done();
            });
    });

    it('Order put API methods with token (invalid input with missing required field)', function (done) {
        orderAPI
            .put('order/' + generatedOrderId)
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .send({
                'description1': modifiedDescription
            })
            .expect(400, done);
    });

    it('Order put API methods with token (extreme long field of more than 100 characters)', function (done) {
        orderAPI
            .put('order/' + generatedOrderId)
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .send({
                'description': '_' + modifiedDescription + '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111'
            })
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);

                // orders should be an array field
                // undefined will be type of undefined
                // null will be type of object, so if the field is string, then it will be not null/undefined
                expect(typeof res.body.orderId).toBe('string');
                expect(typeof res.body.description).toBe('string');

                expect(res.body.description).toContain('_' + modifiedDescription);
                expect(res.body.description).toContain('(TRIM)');
                // Max length on backend
                expect(res.body.description.length < 100).toBeTruthy();

                // This update API will not contain asset
                expect(typeof res.body.asset.sts).toBe('object');
                expect(typeof res.body.asset.sts.Credentials.AccessKeyId).toBe('string');
                expect(typeof res.body.asset.sts.Credentials.SecretAccessKey).toBe('string');
                expect(typeof res.body.asset.sts.Credentials.SessionToken).toBe('string');

                return done();
            });
    });

    it('Order presignedPost API methods with token', function (done) {
        orderAPI
            .post('order/' + generatedOrderId + '/presignedPost')
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .send()
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);

                // return presigned post will be key value
                expect(typeof res.body.fields).toBe('object');

                for (const [key, value] of Object.entries(res.body.fields)) {
                    expect(typeof value).toBe('string');
                }
        
                return done();
            });
    });

    
    it('Order presignedPost API methods with token with invalid orderId', function (done) {
        orderAPI
            .post('order/test-' + generatedOrderId + '/presignedPost')
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .send()
            .expect(404, done);
    });

    it('Order put API methods with token with invalid orderId', function (done) {
        orderAPI
            .put('order/test-' + generatedOrderId)
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .send({
                'description': 'modified testapi'
            })
            .expect(404, done);
    });


    it('Order delete API methods with token', function (done) {
        orderAPI
            .delete('order/' + generatedOrderId)
            .set('Authorization', 'Bearer ' + token)
            .expect(204, done);
    });

    it('Order delete API methods with token with invalid orderId (which was previously deleted)', function (done) {
        orderAPI
            .delete('order/' + generatedOrderId)
            .set('Authorization', 'Bearer ' + token)
            .expect(404, done);
    });


    it('Order create API methods with token with invalid body', function (done) {
        orderAPI
            .post('order')
            .set('Authorization', 'Bearer ' + token)
            .set('Content-Type', 'application/json')
            .send({
                'description1': originalDescription
            })
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);

                // orders should be an array field
                // undefined will be type of undefined
                // null will be type of object, so if the field is string, then it will be not null/undefined
                expect(typeof res.body.orderId).toBe('string');
                expect(typeof res.body.description).toBe('string');
                expect(typeof res.body.asset).toBe('object');
                expect(typeof res.body.asset.region).toBe('string');
                expect(typeof res.body.asset.bucket).toBe('string');

                expect(typeof res.body.asset.sts).toBe('object');
                expect(typeof res.body.asset.sts.Credentials.AccessKeyId).toBe('string');
                expect(typeof res.body.asset.sts.Credentials.SecretAccessKey).toBe('string');
                expect(typeof res.body.asset.sts.Credentials.SessionToken).toBe('string');

                generatedOrderId = res.body.orderId

                console.log('generated order ID by test (invalid body): ' + generatedOrderId);

                return done();
            });
    });

    it('Order delete API methods with token', function (done) {
        orderAPI
            .delete('order/' + generatedOrderId)
            .set('Authorization', 'Bearer ' + token)
            .expect(204, done);
    });
});
