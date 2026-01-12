/**
 * SMM BUFF API - NODEJS EDITION
 * Created by CUONGDEVGPT
 * Load từ file trong thư mục, buff linh hoạt, không log API key
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

// ============================================
// CẤU HÌNH
// ============================================
const CONFIG = {
    LOCAL_FILE: 'apireaction.txt',
    SMM_API_URL: 'https://smm-center.com/api/v2',
    SERVICE_ID: 29117,
    MAX_ORDER_SIZE: 1000,
    MIN_ORDER_SIZE: 1,
    REQUEST_TIMEOUT: 15000,
    MAX_CONCURRENT_REQUESTS: 5
};

// ============================================
// FILE MANAGER
// ============================================
class FileManager {
    constructor() {
        this.filePath = path.join(__dirname, CONFIG.LOCAL_FILE);
        this.ensureFile();
    }

    async ensureFile() {
        try {
            await fs.access(this.filePath);
        } catch (error) {
            await fs.writeFile(this.filePath, '', 'utf8');
            console.log('✅ Đã tạo file mới');
        }
    }

    async loadKeys() {
        try {
            const content = await fs.readFile(this.filePath, 'utf8');
            if (!content.trim()) {
                return { keys: [], total: 0 };
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
                    qty: qty
                });
            }

            return {
                keys: keys,
                total: keys.length,
                totalQty: keys.reduce((sum, k) => sum + k.qty, 0)
            };
        } catch (error) {
            console.error('❌ Lỗi load keys:', error.message);
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
                    console.log(`🗑️ Xoá key: ${key.key.substring(0, 10)}... (qty = 0)`);
                }
            }

            console.log(`💾 Lưu file: ${lines.length} keys, xoá ${deletedCount} keys`);

            await fs.writeFile(this.filePath, lines.join('\n'), 'utf8');
            return true;
        } catch (error) {
            console.error('❌ Lỗi save keys:', error.message);
            return false;
        }
    }

    async checkAllKeys() {
        const data = await this.loadKeys();
        const results = [];

        for (const key of data.keys) {
            const balance = await this.checkBalance(key.key);
            results.push({
                key: key.key.substring(0, 10) + '...',
                qty_in_file: key.qty,
                balance: balance !== null ? `$${balance}` : 'Lỗi check'
            });
        }

        return results;
    }

    async checkBalance(apiKey) {
        return new Promise((resolve) => {
            const postData = new URLSearchParams({
                key: apiKey,
                action: 'balance'
            }).toString();

            const req = https.request(CONFIG.SMM_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': 'NodeJS-SMM-Buffer'
                },
                timeout: CONFIG.REQUEST_TIMEOUT
            }, (res) => {
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
}

// ============================================
// BUFF ENGINE - XỬ LÝ LINH HOẠT
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
        const successfulOrders = [];

        // Xử lý từng key
        for (const key of keys) {
            if (remainingNeeded <= 0) break;
            if (key.qty <= 0) continue;

            const canUse = Math.min(key.qty, remainingNeeded);
            
            // Buff số lượng chính xác, không chia 100
            const result = await this.placeOrder(key.key, targetUrl, canUse);
            
            if (result.success) {
                buffered += canUse;
                key.qty -= canUse;
                remainingNeeded -= canUse;

                // Track usage (không log API key)
                const keyMask = key.key.substring(0, 8) + '***';
                usedKeys.set(keyMask, (usedKeys.get(keyMask) || 0) + canUse);
                successfulOrders.push({
                    order_id: result.order_id,
                    qty: canUse
                });

                console.log(`✅ Buff ${canUse} members thành công (Order: ${result.order_id})`);
                
                // Nếu key hết, dừng ngay
                if (key.qty <= 0) {
                    console.log(`⚠ Key ${keyMask} đã hết số lượng`);
                }
            } else {
                console.log(`❌ Buff ${canUse} members thất bại với key này`);
            }

            // Nghỉ chút giữa các request
            await this.sleep(100);
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

            const req = https.request(CONFIG.SMM_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': 'NodeJS-SMM-Buffer'
                },
                timeout: CONFIG.REQUEST_TIMEOUT
            }, (res) => {
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
                                error: result.error || 'Unknown error'
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
// API SERVER
// ============================================
class ApiServer {
    constructor(port = 3000) {
        this.port = port;
        this.buffEngine = new BuffEngine();
        this.fileMgr = new FileManager();
        this.setupServer();
    }

    setupServer() {
        const server = https.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        server.listen(this.port, () => {
            console.log(`🚀 Server chạy trên port ${this.port}`);
            console.log(`📁 Đang đọc file: ${CONFIG.LOCAL_FILE}`);
        });

        server.on('error', (error) => {
            console.error('❌ Lỗi server:', error.message);
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

            // Special check command
            if (query.anhlamgimadeemkhoc) {
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
    new ApiServer(PORT);
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