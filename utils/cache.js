// Simple in-memory caching service for dashboard data
class CacheService {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL = 15 * 60 * 1000; // 15 minutes in milliseconds
  }

  // Generate cache key from parameters
  generateKey(prefix, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `${prefix}:${sortedParams}`;
  }

  // Set data in cache with TTL
  set(key, data, ttl = this.CACHE_TTL) {
    const expirationTime = Date.now() + ttl;
    this.cache.set(key, {
      data,
      expirationTime
    });
  }

  // Get data from cache
  get(key) {
    const cachedItem = this.cache.get(key);
    
    if (!cachedItem) {
      return null;
    }

    // Check if cache has expired
    if (Date.now() > cachedItem.expirationTime) {
      this.cache.delete(key);
      return null;
    }

    return cachedItem.data;
  }

  // Check if key exists and is not expired
  has(key) {
    const cachedItem = this.cache.get(key);
    return cachedItem && Date.now() <= cachedItem.expirationTime;
  }

  // Delete specific key
  delete(key) {
    return this.cache.delete(key);
  }

  // Clear all cache
  clear() {
    this.cache.clear();
  }

  // Get cache statistics
  getStats() {
    const totalKeys = this.cache.size;
    const expiredKeys = Array.from(this.cache.entries())
      .filter(([_, value]) => Date.now() > value.expirationTime).length;
    
    return {
      totalKeys,
      activeKeys: totalKeys - expiredKeys,
      expiredKeys,
      cacheSize: JSON.stringify(Array.from(this.cache.entries())).length
    };
  }

  // Clean expired entries
  cleanup() {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (now > value.expirationTime) {
        this.cache.delete(key);
        removedCount++;
      }
    }
    
    return removedCount;
  }
}

// Middleware for caching dashboard responses
const cacheDashboard = (duration = 15) => {
  const cacheService = new CacheService();
  
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = cacheService.generateKey('dashboard', {
      ...req.params,
      ...req.query,
      userId: req.user?.id
    });

    try {
      const cachedData = cacheService.get(cacheKey);
      
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true,
          cacheInfo: {
            generatedAt: new Date().toISOString(),
            ttl: duration * 60 * 1000
          }
        });
      }

      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(data) {
        // Cache successful responses only
        if (data.success !== false) {
          cacheService.set(cacheKey, data.data, duration * 60 * 1000);
        }
        return originalJson.call(this, {
          ...data,
          cached: false
        });
      };

      next();
    } catch (error) {
      next();
    }
  };
};

// Cache service instance for direct use
const cacheInstance = new CacheService();

// Middleware for selective caching based on endpoint
const cacheEndpoint = (endpoint, duration = 15) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = cacheInstance.generateKey(endpoint, {
      ...req.params,
      ...req.query,
      userId: req.user?.id
    });

    try {
      const cachedData = cacheInstance.get(cacheKey);
      
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true
        });
      }

      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(data) {
        // Cache successful responses only
        if (data.success !== false) {
          cacheInstance.set(cacheKey, data.data, duration * 60 * 1000);
        }
        return originalJson.call(this, {
          ...data,
          cached: false
        });
      };

      next();
    } catch (error) {
      next();
    }
  };
};

module.exports = {
  CacheService,
  cacheDashboard,
  cacheEndpoint,
  cacheInstance
};