const AWS = require('aws-sdk');
const crypto = require('crypto');

// S3 configuration
const s3 = new AWS.S3({
    apiVersion: '2006-03-01',
    region: process.env.AWS_REGION || 'us-east-1'
});

const bucket = process.env.S3_BUCKET;

// Helper function to extract key from S3 URL
const extractKeyFromUrl = (url) => {
    if (!url) return null;
    try {
        const urlObj = new URL(url);
        return urlObj.pathname.substring(1); // Remove leading slash
    } catch (error) {
        // If URL parsing fails, try to extract from path
        const match = url.match(/\/suppliers\/(.+)$/);
        return match ? match[1] : null;
    }
};

// CREATE: Upload new image
const uploadImage = async (buffer, mimeType, supplierId = null) => {
    if (!buffer) return null;
    if (!bucket) throw new Error('S3_BUCKET env var is required');
    
    const debugInfo = {
        bucket: bucket,
        region: process.env.AWS_REGION || 'us-east-1',
        bufferSize: buffer.length,
        mimeType: mimeType,
        hasCredentials: !!process.env.AWS_ACCESS_KEY_ID,
        timestamp: new Date().toISOString()
    };
    
    console.log('S3 Upload Debug Info:', debugInfo);
    
    // Generate predictable key for updates, random for new uploads
    const key = supplierId 
        ? `suppliers/${supplierId}-${Date.now()}.jpg`
        : `suppliers/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.jpg`;
    
    const params = {
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType
        // Removed ACL: 'public-read' - bucket doesn't support ACLs
    };
    
    try {
        const out = await s3.upload(params).promise();
        console.log('S3 upload successful:', out.Location);
        return { 
            success: true, 
            url: out.Location, 
            key: key, 
            debugInfo 
        };
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

// READ: Get image from S3
const getImage = async (key) => {
    if (!bucket) throw new Error('S3_BUCKET env var is required');
    
    try {
        const params = { Bucket: bucket, Key: key };
        const result = await s3.getObject(params).promise();
        return {
            success: true,
            data: result.Body,
            contentType: result.ContentType,
            lastModified: result.LastModified
        };
    } catch (error) {
        console.error('S3 get image error:', error);
        throw { error: { code: error.code, message: error.message } };
    }
};

// UPDATE: Replace existing image
const updateImage = async (oldImageUrl, newBuffer, mimeType, supplierId) => {
    if (!bucket) throw new Error('S3_BUCKET env var is required');
    
    try {
        // Extract key from old image URL
        const oldKey = extractKeyFromUrl(oldImageUrl);
        
        // Delete old image if it exists
        if (oldKey) {
            await deleteImage(oldKey);
            console.log('Deleted old image:', oldKey);
        }
        
        // Upload new image
        const uploadResult = await uploadImage(newBuffer, mimeType, supplierId);
        return uploadResult;
        
    } catch (error) {
        console.error('S3 update image error:', error);
        throw error;
    }
};

// DELETE: Remove image from S3
const deleteImage = async (key) => {
    if (!bucket) throw new Error('S3_BUCKET env var is required');
    
    try {
        const params = { Bucket: bucket, Key: key };
        const result = await s3.deleteObject(params).promise();
        console.log('S3 delete successful:', key);
        return { success: true, result };
    } catch (error) {
        console.error('S3 delete error:', error);
        throw { error: { code: error.code, message: error.message } };
    }
};

// LIST: Get all images for a supplier
const listSupplierImages = async (supplierId) => {
    if (!bucket) throw new Error('S3_BUCKET env var is required');
    
    try {
        const params = { 
            Bucket: bucket, 
            Prefix: `suppliers/${supplierId}-`,
            MaxKeys: 100
        };
        const result = await s3.listObjectsV2(params).promise();
        return {
            success: true,
            images: result.Contents || [],
            count: result.Contents ? result.Contents.length : 0
        };
    } catch (error) {
        console.error('S3 list images error:', error);
        throw { error: { code: error.code, message: error.message } };
    }
};

// Check if image exists
const imageExists = async (key) => {
    if (!bucket) throw new Error('S3_BUCKET env var is required');
    
    try {
        const params = { Bucket: bucket, Key: key };
        await s3.headObject(params).promise();
        return true;
    } catch (error) {
        if (error.code === 'NotFound') return false;
        throw error;
    }
};

module.exports = {
    uploadImage,
    getImage,
    updateImage,
    deleteImage,
    listSupplierImages,
    imageExists,
    extractKeyFromUrl
};
