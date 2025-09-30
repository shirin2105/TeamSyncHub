const fs = require('fs-extra');
const path = require('path');
const mammoth = require('mammoth');

class AttachmentService {
    constructor() {
        this.supportedPreviewTypes = {
            images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.tif'],
            pdf: ['.pdf'],
            text: ['.txt', '.md', '.log', '.csv', '.json', '.xml', '.html', '.htm', '.css', '.js', '.ts', '.jsx', '.tsx', '.vue', '.php', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.sql', '.yaml', '.yml', '.ini', '.conf', '.config', '.gitignore', '.env'],
            word: ['.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls'],
            audio: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.flac'],
            video: ['.mp4', '.webm', '.ogg', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.m4v']
        };
    }

    /**
     * Kiểm tra file có thể preview được không
     */
    canPreview(filename) {
        const ext = path.extname(filename).toLowerCase();
        return Object.values(this.supportedPreviewTypes).some(types => types.includes(ext));
    }

    /**
     * Xác định loại preview của file
     */
    getPreviewType(filename) {
        const ext = path.extname(filename).toLowerCase();
        
        if (this.supportedPreviewTypes.images.includes(ext)) return 'image';
        if (this.supportedPreviewTypes.pdf.includes(ext)) return 'pdf';
        if (this.supportedPreviewTypes.text.includes(ext)) return 'text';
        if (this.supportedPreviewTypes.word.includes(ext)) return 'word';
        if (this.supportedPreviewTypes.audio.includes(ext)) return 'audio';
        if (this.supportedPreviewTypes.video.includes(ext)) return 'video';
        
        return null;
    }

    /**
     * Đọc nội dung file text
     */
    async readTextFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            return {
                success: true,
                content: content,
                type: 'text'
            };
        } catch (error) {
            console.error('Error reading text file:', error);
            return {
                success: false,
                error: 'Không thể đọc file text'
            };
        }
    }

    /**
     * Convert Word document to HTML
     */
    async convertWordToHtml(filePath) {
        try {
            const result = await mammoth.convertToHtml({ path: filePath });
            return {
                success: true,
                content: result.value,
                type: 'word',
                warnings: result.messages
            };
        } catch (error) {
            console.error('Error converting Word document:', error);
            return {
                success: false,
                error: 'Không thể đọc file Word'
            };
        }
    }

    /**
     * Lấy thông tin file để preview
     */
    async getFileInfo(filePath, filename) {
        try {
            const stats = await fs.stat(filePath);
            const ext = path.extname(filename).toLowerCase();
            
            return {
                filename: filename,
                size: stats.size,
                extension: ext,
                canPreview: this.canPreview(filename),
                previewType: this.getPreviewType(filename),
                sizeFormatted: this.formatFileSize(stats.size)
            };
        } catch (error) {
            console.error('Error getting file info:', error);
            return null;
        }
    }

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = new AttachmentService();
