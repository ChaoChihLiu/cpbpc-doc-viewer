import mysql from "mysql2/promise";
import env from 'dotenv'

env.config()

const pool = mysql.createPool({
    host: process.env.EN_DB_HOST,
    port: process.env.EN_DB_PORT,
    user: process.env.EN_DB_USER,
    password: process.env.EN_DB_PASS,
    database: process.env.EN_DB,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 50
});

export default pool;

