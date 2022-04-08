-- Set s3_prefix to max s3 file name length https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html
CREATE TABLE IF NOT EXISTS orders (
    order_id varchar(120) NOT NULL,
    description varchar(30) NOT NULL,
    s3_prefix varchar(1024) NOT NULL,
    PRIMARY KEY (order_id)
);