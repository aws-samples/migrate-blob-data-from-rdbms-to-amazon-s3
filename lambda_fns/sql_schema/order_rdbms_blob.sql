-- Set bytea to store the binary https://www.postgresql.org/docs/9.0/datatype-binary.html
CREATE TABLE IF NOT EXISTS orders_rdbms_blob (
    order_id varchar(120) NOT NULL,
    description varchar(30) NOT NULL,
    order_blob LONGBLOB NOT NULL,
    PRIMARY KEY (order_id)
);