const Supplier = require("../models/supplier.model.js");
const { uploadImage, updateImage, deleteImage, listSupplierImages } = require("../utils/s3-utils.js");
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
                        const uploadResult = await uploadImage(maybeFile.buffer, maybeFile.mimetype);
                        supplier.photo_url = uploadResult.url;
                        console.log('Image uploaded successfully:', uploadResult.url);
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
                        // Use updateImage to replace existing image
                        const uploadResult = await updateImage(
                            req.body.photo_url, // old image URL
                            maybeFile.buffer, 
                            maybeFile.mimetype,
                            supplier.id
                        );
                        supplier.photo_url = uploadResult.url;
                        console.log('Image updated successfully:', uploadResult.url);
                    } catch (e) {
                        console.error('S3 image update failed', e);
                        return res.render("500", {message: `Image update failed. Details: ${JSON.stringify(e.error)}`});
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
    // First get the supplier to find the image URL
    Supplier.findById(req.params.id, (err, supplierData) => {
        if (err) {
            return res.render("500", {message: `Error retrieving student with id ${req.params.id}`});
        }
        
        // Delete image from S3 if it exists
        if (supplierData && supplierData.photo_url) {
            (async () => {
                try {
                    const { deleteImage, extractKeyFromUrl } = require("../utils/s3-utils.js");
                    const key = extractKeyFromUrl(supplierData.photo_url);
                    if (key) {
                        await deleteImage(key);
                        console.log('Image deleted from S3:', key);
                    }
                } catch (imageError) {
                    console.error('Failed to delete image from S3:', imageError);
                    // Continue with supplier deletion even if image deletion fails
                }
                
                // Now delete the supplier from database
                Supplier.delete(req.params.id, (err, data) => {
                    if (err) {
                        if (err.kind === "not_found") {
                            res.status(404).send({
                                message: `Not found Student with id ${req.params.id}.`
                            });
                        } else {
                            res.render("500", {message: `Could not delete Student with id ${req.params.id}`});
                        }
                    } else res.redirect("/students");
                });
            })();
        } else {
            // No image to delete, just delete supplier
            Supplier.delete(req.params.id, (err, data) => {
                if (err) {
                    if (err.kind === "not_found") {
                        res.status(404).send({
                            message: `Not found Student with id ${req.params.id}.`
                        });
                    } else {
                        res.render("500", {message: `Could not delete Student with id ${req.params.id}`});
                    }
                } else res.redirect("/students");
            });
        }
    });
};

exports.removeAll = (req, res) => {
    Supplier.removeAll((err, data) => {
        if (err)
            res.render("500", {message: `Some error occurred while removing all students.`});
        else res.send({message: `All students were deleted successfully!`});
    });
};

// New function: Get all images for a supplier
exports.getSupplierImages = async (req, res) => {
    try {
        const supplierId = req.params.id;
        const images = await listSupplierImages(supplierId);
        res.json(images);
    } catch (error) {
        console.error('Failed to get supplier images:', error);
        res.status(500).json({ error: 'Failed to get supplier images' });
    }
};