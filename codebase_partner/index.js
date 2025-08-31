const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors")
const supplier = require("./app/controller/supplier.controller");
const app = express();
const mustacheExpress = require("mustache-express")
const favicon = require('serve-favicon');
const multer = require('multer');

// configure multer to handle image uploads in memory
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowed = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp'
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// parse requests of content-type: application/json
app.use(bodyParser.json());
// parse requests of content-type: application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: true}));
app.use(cors());
app.options("*", cors());
app.engine("html", mustacheExpress())
app.set("view engine", "html")
app.set("views", __dirname + "/views")
app.use(express.static('public'));
app.use(favicon(__dirname + "/public/img/favicon.ico"));

// list all the students
app.get("/", (req, res) => {
    res.render("home", {});
});
app.get("/students/", supplier.findAll);
// show the add suppler form
app.get("/supplier-add", (req, res) => {
    res.render("supplier-add", {});
});
// receive the add supplier POST
app.post("/supplier-add", upload.single('photo'), supplier.create);
// show the update form
app.get("/supplier-update/:id", supplier.findOne);
// receive the update POST
app.post("/supplier-update", upload.single('photo'), supplier.update);
// receive the POST to delete a supplier
app.post("/supplier-remove/:id", supplier.remove);

// Test S3 connectivity
app.get("/test-s3", async (req, res) => {
    try {
        const AWS = require('aws-sdk');
        const s3 = new AWS.S3({
            apiVersion: '2006-03-01',
            region: process.env.AWS_REGION || 'us-east-1'
        });
        
        console.log('Testing S3 connection...');
        console.log('Region:', process.env.AWS_REGION || 'us-east-1');
        console.log('Bucket:', process.env.S3_BUCKET);
        console.log('AWS credentials available:', !!process.env.AWS_ACCESS_KEY_ID);
        
        if (!process.env.S3_BUCKET) {
            return res.json({ error: 'S3_BUCKET environment variable not set' });
        }
        
        // Try to list objects in the bucket
        const result = await s3.listObjectsV2({
            Bucket: process.env.S3_BUCKET,
            MaxKeys: 1
        }).promise();
        
        res.json({ 
            success: true, 
            message: 'S3 connection successful',
            bucket: process.env.S3_BUCKET,
            region: process.env.AWS_REGION || 'us-east-1',
            objectsCount: result.Contents ? result.Contents.length : 0
        });
        
    } catch (error) {
        console.error('S3 test failed:', error);
        res.json({ 
            error: 'S3 connection failed', 
            details: {
                code: error.code,
                message: error.message,
                statusCode: error.statusCode
            }
        });
    }
});

// handle 404
app.use(function (req, res, next) {
    res.status(404).render("404", {});
})


// set port, listen for requests
const app_port = process.env.APP_PORT ||3000
app.listen(app_port, () => {
    console.log(`Server is running on port ${app_port}.`);
});