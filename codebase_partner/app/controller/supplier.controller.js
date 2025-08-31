const Supplier = require("../models/supplier.model.js");
const AWS = require('aws-sdk');
const crypto = require('crypto');

// S3 configuration via environment variables
// Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET
const s3 = new AWS.S3({
    apiVersion: '2006-03-01',
    region: process.env.AWS_REGION || 'us-east-1'
});

const uploadBufferToS3 = async (buffer, mimeType) => {
    if (!buffer) return null;
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('S3_BUCKET env var is required');
    
    // Create debug info object to send to browser
    const debugInfo = {
        bucket: bucket,
        region: process.env.AWS_REGION || 'us-east-1',
        bufferSize: buffer.length,
        mimeType: mimeType,
        hasCredentials: !!process.env.AWS_ACCESS_KEY_ID,
        timestamp: new Date().toISOString()
    };
    
    console.log('S3 Upload Debug Info:', debugInfo);
    
    const key = `suppliers/${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const params = {
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: 'public-read'
    };
    
    try {
        const out = await s3.upload(params).promise();
        console.log('S3 upload successful:', out.Location);
        return { success: true, url: out.Location, debugInfo };
    } catch (error) {
        const errorDetails = {
            code: error.code,
            message: error.message,
            statusCode: error.statusCode,
            requestId: error.requestId,
            debugInfo: debugInfo
        };
        console.error('S3 upload error details:', errorDetails);
        throw { error: errorDetails };
    }
};


const {body, validationResult} = require("express-validator");


exports.create = [

    // Validate and sanitize the name field.
    body('name', 'The student name is required').trim().isLength({min: 1}).escape(),
    body('address', 'The student address is required').trim().isLength({min: 1}).escape(),
    body('city', 'The student city is required').trim().isLength({min: 1}).escape(),
    body('state', 'The student state is required').trim().isLength({min: 1}).escape(),
    body('phone', 'Phone number should be 10 digit number plus optional country code').trim().isMobilePhone().escape(),

    // Process request after validation and sanitization.
    (req, res, next) => {

        // Extract the validation errors from a request.
        const errors = validationResult(req);

        // Create a supplier object with escaped and trimmed data.
        const supplier = new Supplier(req.body);

        // Upload image if present
        const maybeFile = req.file;

        if (!errors.isEmpty()) {
            // There are errors. Render the form again with sanitized values/error messages.
            res.render('supplier-add', {title: 'Create Genre', supplier: supplier, errors: errors.array()});
        } else {
            // Data from form is valid., upload to S3 if provided, then save to db
            (async () => {
                if (maybeFile) {
                    try {
                        const uploadResult = await uploadBufferToS3(maybeFile.buffer, maybeFile.mimetype);
                        supplier.photo_url = uploadResult.url;
                    } catch (e) {
                        console.error('S3 upload failed', e);
                        return res.render("500", {message: `Image upload failed. Details: ${JSON.stringify(e.error)}`});
                    }
                }
                // ensure photo_url is persisted if not uploading
                if (!supplier.photo_url && req.body.photo_url) {
                    supplier.photo_url = req.body.photo_url;
                }
            
            Supplier.create(supplier, (err, data) => {
                if (err)
                    res.render("500", {message: `Error occurred while creating the Student.`});
                else res.redirect("/students");
            });
            })();
        }
    }
];

exports.findAll = (req, res) => {
    Supplier.getAll((err, data) => {
        if (err)
            res.render("500", {message: "The was a problem retrieving the list of students"});
        else res.render("supplier-list-all", {students: data});
    });
};

exports.findOne = (req, res) => {
    Supplier.findById(req.params.id, (err, data) => {
        if (err) {
            if (err.kind === "not_found") {
                res.status(404).send({
                    message: `Not found Student with id ${req.params.id}.`
                });
            } else {
                res.render("500", {message: `Error retrieving student with id ${req.params.id}`});
            }
        } else res.render("supplier-update", {supplier: data});
    });
};


exports.update = [

    // Validate and sanitize the name field.
    body('name', 'The student name is required').trim().isLength({min: 1}).escape(),
    body('address', 'The student address is required').trim().isLength({min: 1}).escape(),
    body('city', 'The student city is required').trim().isLength({min: 1}).escape(),
    body('state', 'The student state is required').trim().isLength({min: 1}).escape(),
    body('phone', 'Phone number should be 10 digit number plus optional country code').trim().isMobilePhone().escape(),

    // Process request after validation and sanitization.
    (req, res, next) => {

        // Extract the validation errors from a request.
        const errors = validationResult(req);

        // Create a supplier object with escaped and trimmed data.
        const supplier = new Supplier(req.body);
        const maybeFile = req.file;

        if (!errors.isEmpty()) {
            // There are errors. Render the form again with sanitized values/error messages.
            res.render('supplier-update', {supplier: supplier, errors: errors.array()});
        } else {
            // Upload to S3 if provided, then save to db
            (async () => {
                if (maybeFile) {
                    try {
                        const uploadResult = await uploadBufferToS3(maybeFile.buffer, maybeFile.mimetype);
                        supplier.photo_url = uploadResult.url;
                    } catch (e) {
                        console.error('S3 upload failed', e);
                        return res.render("500", {message: `Image upload failed. Details: ${JSON.stringify(e.error)}`});
                    }
                }
                if (!supplier.photo_url && req.body.photo_url) {
                    supplier.photo_url = req.body.photo_url;
                }
                Supplier.updateById(
                    req.body.id,
                    supplier,
                    (err, data) => {
                        if (err) {
                            if (err.kind === "not_found") {
                                res.status(404).send({
                                    message: `Student with id ${req.body.id} Not found.`
                                });
                            } else {
                                res.render("500", {message: `Error updating Student with id ${req.body.id}`});
                            }
                        } else res.redirect("/students");
                    }
                );
            })();
        }
    }
];

exports.remove = (req, res) => {
    Supplier.delete(req.params.id, (err, data) => {
        if (err) {
            if (err.kind === "not_found") {
                res.status(404).send({
                    message: `Not found Student with id ${req.params.id}.`
                });
            } else {
                res.render("500", {message: `Could not delete Student with id ${req.body.id}`});
            }
        } else res.redirect("/students");
    });
};

exports.removeAll = (req, res) => {
    Supplier.removeAll((err, data) => {
        if (err)
            res.render("500", {message: `Some error occurred while removing all students.`});
        else res.send({message: `All students were deleted successfully!`});
    });
};