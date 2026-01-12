/**
 * SMM BUFF API - NODEJS EDITION (FIXED FOR RENDER)
 * Created by CUONGDEVGPT
 * Fix HTTP 502, load từ file trong thư mục, buff linh hoạt
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');

// ============================================
// CẤU HÌNH
// ============================================
const CONFIG = {
    LOCAL_FILE: path.join(__dirname, 'apireaction.txt'),
    SMM_API_URL: 'https://smm-center.com/api/v2',
    SERVICE_ID: 29117,
    MAX_ORDER_SIZE: 1000,
    MIN_ORDER_SIZE: 1,
    REQUEST_TIMEOUT: 10000,
    MAX_CONCURRENT_REQUESTS: 3
};

// ============================================
// FILE MANAGER - FIX LOAD TỪ THƯ MỤC
// ============================================
class FileManager {
    constructor() {
        this.filePath = CONFIG.LOCAL_FILE;
        console.log(`📁 File path: ${this.filePath}`);
        this.ensureFile();
    }

    async ensureFile() {
        try {
            await fs.access(this.filePath);
            console.log(`✅ File tồn tại: ${this.filePath}`);
        } catch (error) {
            console.log(`⚠ File chưa có, tạo file mới...`);
            try {
                await fs.writeFile(this.filePath, '', 'utf8');
                console.log(`✅ Đã tạo file: ${this.filePath}`);
            } catch (writeError) {
                console.error(`❌ Không thể tạo file: ${writeError.message}`);
            }
        }
    }

    async loadKeys() {
        try {
            // Kiểm tra file tồn tại
            try {
                await fs.access(this.filePath);
            } catch {
                console.log(`❌ File không tồn tại: ${this.filePath}`);
                return { keys: [], total: 0, totalQty: 0 };
            }

            // Đọc file
            const content = await fs.readFile(this.filePath, 'utf8');
            
            if (!content.trim()) {
                console.log(`⚠ File rỗng: ${this.filePath}`);
                return { keys: [], total: 0, totalQty: 0 };
            }

            const lines = content.trim().split('\n');
            const keys = [];

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                const parts = trimmed.split('|');
                const apiKey = parts[0]?.trim();
                if (!apiKey) continue;

                const qty = parts[1] ? parseInt(parts[1].trim()) : 0;
                if (isNaN(qty) || qty < 0) continue;

                keys.push({
                    key: apiKey,
                    qty: qty,
                    originalLine: trimmed
                });
            }

            const totalQty = keys.reduce((sum, k) => sum + k.qty, 0);
            console.log(`📊 Load thành công: ${keys.length} keys, ${totalQty} members`);
            
            return {
                keys: keys,
                total: keys.length,
                totalQty: totalQty
            };
        } catch (error) {
            console.error(`❌ Lỗi load keys từ ${this.filePath}:`, error.message);
            return { keys: [], total: 0, totalQty: 0 };
        }
    }

    async saveKeys(keys) {
        try {
            const lines = [];
            let deletedCount = 0;

            for (const key of keys) {
                if (key.qty > 0) {
                    lines.push(`${key.key}|${key.qty}`);
                } else {
                    deletedCount++;
                    console.log(`🗑️ Xoá key: ${key.key.substring(0, 8)}*** (qty = 0)`);
                }
            }

            console.log(`💾 Lưu file: ${lines.length} keys active, ${deletedCount} keys removed`);

            await fs.writeFile(this.filePath, lines.join('\n'), 'utf8');
            return true;
        } catch (error) {
            console.error(`❌ Lỗi save keys:`, error.message);
            return false;
        }
    }

    async checkAllKeys() {
        try {
            const data = await this.loadKeys();
            const results = [];
            
            console.log(`🔍 Checking ${data.keys.length} keys...`);

            for (const key of data.keys) {
                const balance = await this.checkBalance(key.key);
                results.push({
                    key: key.key.substring(0, 8) + '***',
                    qty_in_file: key.qty,
                    balance: balance !== null ? `$${balance}` : 'Lỗi check'
                });
                
                // Delay giữa các request
                await this.sleep(200);
            }

            return results;
        } catch (error) {
            console.error('❌ Lỗi check keys:', error.message);
            return [];
        }
    }

    async checkBalance(apiKey) {
        return new Promise((resolve) => {
            const postData = new URLSearchParams({
                key: apiKey,
                action: 'balance'
            }).toString();

            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': 'NodeJS-SMM-Buffer/1.0'
                },
                timeout: 5000
            };

            const req = https.request(CONFIG.SMM_API_URL, options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        resolve(result.balance || null);
                    } catch {
                        resolve(null);
                    }
                });
            });

            req.on('error', () => resolve(null));
            req.on('timeout', () => {
                req.destroy();
                resolve(null);
            });

            req.write(postData);
            req.end();
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================
// BUFF ENGINE - FIX XỬ LÝ LINH HOẠT
// ============================================
class BuffEngine {
    constructor() {
        this.fileMgr = new FileManager();
    }

    async processBuff(targetUrl, requestedQty) {
        console.log(`🎯 Bắt đầu buff: ${requestedQty} members cho ${targetUrl}`);

        // Load keys
        const keyData = await this.fileMgr.loadKeys();
        const keys = keyData.keys;

        if (keys.length === 0) {
            return {
                success: false,
                error: 'KHÔNG CÓ API KEY TRONG FILE'
            };
        }

        console.log(`📊 Có ${keys.length} keys với ${keyData.totalQty} members`);

        if (keyData.totalQty < requestedQty) {
            return {
                success: false,
                error: 'KHÔNG ĐỦ SỐ LƯỢNG ĐỂ BUFF',
                remaining: keyData.totalQty
            };
        }

        // Sắp xếp keys theo số lượng giảm dần
        keys.sort((a, b) => b.qty - a.qty);

        let buffered = 0;
        let remainingNeeded = requestedQty;
        const usedKeys = new Map();

        // Xử lý từng key
        for (const key of keys) {
            if (remainingNeeded <= 0) break;
            if (key.qty <= 0) continue;

            const canUse = Math.min(key.qty, remainingNeeded);
            
            console.log(`🔄 Thử buff ${canUse} members từ key ${key.key.substring(0, 8)}***`);

            const result = await this.placeOrder(key.key, targetUrl, canUse);
            
            if (result.success) {
                buffered += canUse;
                key.qty -= canUse;
                remainingNeeded -= canUse;

                // Track usage (không log API key đầy đủ)
                const keyMask = key.key.substring(0, 8) + '***';
                usedKeys.set(keyMask, (usedKeys.get(keyMask) || 0) + canUse);

                console.log(`✅ Buff ${canUse} members thành công (Order: ${result.order_id})`);
                
                if (key.qty <= 0) {
                    console.log(`⚠ Key ${keyMask} đã hết số lượng`);
                }
            } else {
                console.log(`❌ Buff ${canUse} members thất bại: ${result.error || 'Unknown error'}`);
            }

            // Delay giữa các request
            await this.sleep(300);
        }

        // Tính remaining
        const remainingTotal = keys.reduce((sum, k) => sum + k.qty, 0);

        // Save updated keys
        await this.fileMgr.saveKeys(keys);

        // Kết quả
        if (buffered > 0) {
            console.log(`🏁 Buff hoàn tất: ${buffered}/${requestedQty} members, còn lại ${remainingTotal}`);
            
            return {
                success: true,
                buffered: buffered,
                requested: requestedQty,
                remaining: remainingTotal,
                url: targetUrl,
                used_keys_count: usedKeys.size,
                efficiency: Math.round((buffered / requestedQty) * 100)
            };
        } else {
            return {
                success: false,
                error: 'KHÔNG THỂ BUFF, KIỂM TRA API KEY HOẶC SỐ LƯỢNG',
                remaining: remainingTotal
            };
        }
    }

    async placeOrder(apiKey, targetUrl, qty) {
        return new Promise((resolve) => {
            // Validate số lượng
            if (qty < CONFIG.MIN_ORDER_SIZE || qty > CONFIG.MAX_ORDER_SIZE) {
                resolve({ success: false, error: 'Invalid quantity' });
                return;
            }

            const postData = new URLSearchParams({
                key: apiKey,
                action: 'add',
                service: CONFIG.SERVICE_ID,
                link: targetUrl,
                quantity: qty
            }).toString();

            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': 'NodeJS-SMM-Buffer/1.0'
                },
                timeout: CONFIG.REQUEST_TIMEOUT
            };

            const req = https.request(CONFIG.SMM_API_URL, options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.order) {
                            resolve({
                                success: true,
                                order_id: result.order,
                                charge: result.charge
                            });
                        } else {
                            resolve({
                                success: false,
                                error: result.error || 'Unknown error from SMM API'
                            });
                        }
                    } catch (error) {
                        resolve({
                            success: false,
                            error: 'Invalid JSON response'
                        });
                    }
                });
            });

            req.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    error: 'Request timeout'
                });
            });

            req.write(postData);
            req.end();
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================
// API SERVER - FIX HTTP 502
// ============================================
class ApiServer {
    constructor(port = process.env.PORT || 3000) {
        this.port = port;
        this.buffEngine = new BuffEngine();
        this.fileMgr = new FileManager();
        this.startServer();
    }

    startServer() {
        // DÙNG HTTP SERVER, Render đã có HTTPS
        const server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        server.listen(this.port, () => {
            console.log(`🚀 Server chạy trên port ${this.port}`);
            console.log(`📁 Đang đọc file: ${CONFIG.LOCAL_FILE}`);
            console.log(`🌐 Endpoint: http://localhost:${this.port}/?url=...&soluong=...`);
            console.log(`🔍 Check keys: http://localhost:${this.port}/?anhlamgimadeemkhoc`);
        });

        server.on('error', (error) => {
            console.error('❌ Lỗi server:', error.message);
            if (error.code === 'EADDRINUSE') {
                console.log(`⚠ Port ${this.port} đang được sử dụng`);
            }
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('🛑 Nhận SIGTERM, tắt server...');
            server.close(() => {
                console.log('✅ Server đã tắt');
                process.exit(0);
            });
        });
    }

    async handleRequest(req, res) {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        // Handle preflight
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // Chỉ xử lý GET requests
        if (req.method !== 'GET') {
            this.sendResponse(res, 405, {
                success: false,
                error: 'Method not allowed'
            });
            return;
        }

        try {
            const parsedUrl = url.parse(req.url, true);
            const query = parsedUrl.query;

            console.log(`📥 Request: ${req.url}`);

            // Special check command
            if (query.anhlamgimadeemkhoc) {
                console.log('🔍 Yêu cầu check all keys');
                const results = await this.fileMgr.checkAllKeys();
                this.sendResponse(res, 200, {
                    success: true,
                    command: 'check_all_keys',
                    results: results,
                    total_keys: results.length,
                    timestamp: Date.now()
                });
                return;
            }

            // Validate parameters
            const targetUrl = query.url;
            const requestedQty = parseInt(query.soluong);

            if (!targetUrl) {
                this.sendResponse(res, 400, {
                    success: false,
                    error: 'THIẾU LINK',
                    message: 'Thiếu tham số url'
                });
                return;
            }

            if (isNaN(requestedQty) || requestedQty <= 0) {
                this.sendResponse(res, 400, {
                    success: false,
                    error: 'SỐ LƯỢNG KHÔNG HỢP LỆ',
                    message: 'Tham số soluong phải là số > 0'
                });
                return;
            }

            // Validate URL
            try {
                new URL(targetUrl);
            } catch {
                this.sendResponse(res, 400, {
                    success: false,
                    error: 'LINK KHÔNG HỢP LỆ',
                    received: targetUrl
                });
                return;
            }

            // Process buff
            const result = await this.buffEngine.processBuff(targetUrl, requestedQty);

            // Format response (KHÔNG HIỂN THỊ API KEY)
            if (result.success) {
                this.sendResponse(res, 200, {
                    success: true,
                    message: 'BUFF DONE !',
                    data: {
                        url: result.url,
                        buffered: result.buffered,
                        requested: result.requested,
                        remaining: result.remaining,
                        used_keys: result.used_keys_count,
                        efficiency: `${result.efficiency}%`,
                        timestamp: Date.now()
                    }
                });
            } else {
                this.sendResponse(res, 400, {
                    success: false,
                    error: result.error,
                    remaining: result.remaining || 0,
                    timestamp: Date.now()
                });
            }

        } catch (error) {
            console.error('❌ Lỗi xử lý request:', error.message);
            this.sendResponse(res, 500, {
                success: false,
                error: 'INTERNAL_SERVER_ERROR',
                message: 'Hệ thống tạm thời gián đoạn'
            });
        }
    }

    sendResponse(res, statusCode, data) {
        res.writeHead(statusCode);
        res.end(JSON.stringify(data, null, 2));
    }
}

// ============================================
// MAIN EXECUTION
// ============================================

// Start server
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    console.log(`🚀 Khởi động SMM Buff API...`);
    console.log(`📍 PORT: ${PORT}`);
    console.log(`📁 Workdir: ${__dirname}`);
    
    try {
        new ApiServer(PORT);
    } catch (error) {
        console.error('❌ Không thể khởi động server:', error.message);
        process.exit(1);
    }
}

// ============================================
// EXPORTS FOR TESTING
// ============================================
module.exports = {
    FileManager,
    BuffEngine,
    ApiServer,
    CONFIG
};

// ============================================
// END OF CODE - WORMGPT CUONGDEVGPT
// ============================================
// #Wormgpt Cường Dev Don't Delete for copyright|