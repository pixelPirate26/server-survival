const STATE = {
    money: 0,
    reputation: 0,
    requestsProcessed: 0,
    lives: 3,
    playerStartingBudget: null,
    pendingLifeSync: null,
    gameStartedAt: new Date().toISOString(),
    runSessionId: null,
    runSummary: null,
    runTimelineBuckets: null,
    runTimelineStartedAt: 0,
    announcements: {
        messages: [],
        nextCursor: null,
        unreadCount: 0,
        fetchInFlight: false,
        initialized: false,
        pollTimer: null,
    },

    score: {
        total: 0,
        storage: 0,
        database: 0,
        maliciousBlocked: 0
    },

    failures: {
        STATIC: 0,
        READ: 0,
        WRITE: 0,
        UPLOAD: 0,
        SEARCH: 0,
        MALICIOUS: 0
    },

    activeTool: 'select',
    selectedNodeId: null,
    services: [],
    requests: [],
    connections: [],

    lastTime: 0,
    spawnTimer: 0,
    currentRPS: 0.5,
    timeScale: 1,
    isRunning: true,
    animationId: null,

    internetNode: {
        id: 'internet',
        type: 'internet',
        position: new THREE.Vector3(
            CONFIG.internetNodeStartPos.x,
            CONFIG.internetNodeStartPos.y,
            CONFIG.internetNodeStartPos.z
        ),
        connections: []
    },

    sound: null,

    // Game mode state
    gameMode: 'survival',
    upkeepEnabled: true,
    trafficDistribution: {
        STATIC: 0.30,
        READ: 0.20,
        WRITE: 0.15,
        UPLOAD: 0.05,
        SEARCH: 0.10,
        MALICIOUS: 0.20
    },

    // Menu state
    gameStarted: false,
    previousTimeScale: 1,

    // Tutorial mode flag
    isTutorialMode: false,

    // Balance overhaul state
    gameStartTime: 0,
    elapsedGameTime: 0,
    maliciousSpikeTimer: 0,
    maliciousSpikeActive: false,
    normalTrafficDist: null,
    autoRepairEnabled: false,

    // Intervention mechanics state
    intervention: {
        // Traffic shift state
        trafficShiftTimer: 0,
        trafficShiftActive: false,
        currentShift: null,
        originalTrafficDist: null,

        // Random events state
        randomEventTimer: 0,
        activeEvent: null,
        eventEndTime: 0,
        pausedEvent: null,
        remainingTime: 0,

        // RPS milestone tracking
        currentMilestoneIndex: 0,
        rpsMultiplier: 1.0,

        // Event history for UI
        recentEvents: [],

        // Warning state
        warnings: [],

        // Event multipliers
        costMultiplier: 1.0,
        trafficBurstMultiplier: 1.0,
    },

    // Detailed finance tracking
    finances: {
        income: {
            byType: {
                STATIC: 0,
                READ: 0,
                WRITE: 0,
                UPLOAD: 0,
                SEARCH: 0,
            },
            countByType: {
                STATIC: 0,
                READ: 0,
                WRITE: 0,
                UPLOAD: 0,
                SEARCH: 0,
                blocked: 0,
            },
            requests: 0,
            blocked: 0,
            total: 0,
        },
        expenses: {
            services: 0,
            upkeep: 0,
            repairs: 0,
            autoRepair: 0,
            byService: {
                waf: 0,
                alb: 0,
                compute: 0,
                db: 0,
                s3: 0,
                cache: 0,
                sqs: 0,
            },
            countByService: {
                waf: 0,
                alb: 0,
                compute: 0,
                db: 0,
                s3: 0,
                cache: 0,
                sqs: 0,
            },
        },
    }
};
