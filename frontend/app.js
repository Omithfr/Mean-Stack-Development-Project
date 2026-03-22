var app = angular.module('goldApp', []);
app.controller('MainController', function($scope, $http, $timeout) {
    
    // --- THEME & NAVIGATION LOGIC ---
    $scope.isDarkMode = true;
    document.documentElement.setAttribute('data-theme', 'dark');
    
    $scope.toggleTheme = function() {
        if ($scope.isDarkMode) { $scope.isDarkMode = false; } 
        else { $scope.isDarkMode = true; }
        document.documentElement.setAttribute('data-theme', $scope.isDarkMode ? 'dark' : 'light');
        if($scope.currentView === 'dashboard') {
            $scope.setTimeframe($scope.activeTimeframe);
        }
    };

    $scope.currentView = localStorage.getItem('aurumView') || 'home';
    
    $scope.setView = function(view) { 
        $scope.currentView = view; 
        localStorage.setItem('aurumView', view);
        if(view === 'dashboard') {
            $timeout(() => $scope.setTimeframe($scope.activeTimeframe), 100);
        }
        if(view === 'database' && $scope.adminUnlocked) {
            $scope.fetchAdminData();
        }
    };

    // ==========================================
    // USER AUTHENTICATION & TRADING API LOGIC
    // ==========================================
    $scope.authMode = 'login'; 
    $scope.currentUser = null;
    $scope.regData = {}; 
    $scope.loginData = {}; 
    $scope.userOrders = []; 
    
    $scope.tradeConfig = { qty: 1, purity: "24", shape: "Coin", userNote: "" };
    $scope.availableWeights = {
        "Coin": [1, 2, 5, 10],
        "Bar": [10, 20, 50, 100, 250, 500, 1000],
        "Ingot": [1000, 5000, 12500] 
    };
    $scope.tradeConfig.qty = $scope.availableWeights["Coin"][0]; 
    
    $scope.currentPuritySpotRate = 0;
    $scope.tradeBaseVal = 0;
    $scope.tradePremium = 0;
    $scope.premiumPercentDisplay = 5; 
    $scope.tradeTax = 0;
    $scope.tradeTotalCost = 0;

    $scope.handleShapeChange = function() {
        if ($scope.tradeConfig.shape !== 'Jewelry') {
            $scope.tradeConfig.qty = $scope.availableWeights[$scope.tradeConfig.shape][0];
        } else {
            $scope.tradeConfig.qty = 10; 
        }
        $scope.calcTrade();
    };

    $scope.fetchUserOrders = function() {
        if(!$scope.currentUser) return;
        $http.post('/api/user-orders-fetch', { email: $scope.currentUser.email }).then(function(res) {
            $scope.userOrders = res.data;
        }).catch(function(err) {
            console.error("Vault Fetch Error:", err);
        });
    };

    $scope.replyToAdmin = function(order) {
        let userMessage = prompt("Send a follow-up note to the Admin regarding this order:");
        if (!userMessage) return; 
        
        $http.put('/api/orders/' + order._id + '/user-note', { note: userMessage }).then(function(res) {
            alert("Message successfully sent to the Vault Admin.");
            $scope.fetchUserOrders(); 
        }).catch(function(err) {
            alert("Failed to send message.");
        });
    };

    $scope.register = function() {
        if(!$scope.regData.name || !$scope.regData.email || !$scope.regData.password || !$scope.regData.number) {
            return alert("Error: Please fill out all required fields to register.");
        }
        if (/[0-9]/.test($scope.regData.name)) {
            return alert("Error: Full Name must contain only letters and cannot include numbers.");
        }
        let emailPrefix = $scope.regData.email.split('@')[0];
        if (emailPrefix && !/[a-zA-Z]/.test(emailPrefix)) {
            return alert("Error: Email address must contain letters.");
        }
        if (!/^[0-9]{10}$/.test($scope.regData.number)) {
            return alert("Error: Please enter a valid 10-digit Indian mobile number.");
        }

        $http.post('/api/register', $scope.regData).then(function(res) {
            alert("Registration successful! You can now log into your vault.");
            $scope.authMode = 'login'; 
            $scope.regData = {}; 
        }).catch(function(err) {
            alert("Registration Failed: " + (err.data.error || "Email is likely already registered."));
        });
    };

    $scope.login = function() {
        if(!$scope.loginData.email || !$scope.loginData.password) {
            return alert("Error: Please enter both email and password.");
        }

        $http.post('/api/login', $scope.loginData).then(function(res) {
            $scope.currentUser = res.data.user; 
            $scope.loginData.password = ''; 
            $scope.calcTrade();
            $scope.fetchUserOrders(); 
        }).catch(function(err) {
            alert("Login Failed: " + (err.data.error || "Incorrect email or password."));
        });
    };

    $scope.logout = function() { 
        $scope.currentUser = null; 
        $scope.loginData = {};
        $scope.userOrders = [];
        $scope.tradeConfig.qty = $scope.availableWeights["Coin"][0];
        $scope.tradeConfig.userNote = ""; 
    };

    $scope.calcTrade = function() {
        if(!$scope.basePricePerGramINR) { return; }

        let purityMulti = 1; 
        if($scope.tradeConfig.purity === "22") { purityMulti = 0.916; }
        if($scope.tradeConfig.purity === "18") { purityMulti = 0.750; }
        
        let rawGoldPricePerGram24K = ($scope.basePricePerGramINR / 1.03); 
        $scope.currentPuritySpotRate = rawGoldPricePerGram24K * purityMulti;
        
        $scope.tradeBaseVal = $scope.tradeConfig.qty * $scope.currentPuritySpotRate;

        let premiumPercentDecimal = 0;
        if($scope.tradeConfig.shape === "Coin") { premiumPercentDecimal = 0.05; $scope.premiumPercentDisplay = 5; }
        if($scope.tradeConfig.shape === "Bar") { premiumPercentDecimal = 0.02; $scope.premiumPercentDisplay = 2; }
        if($scope.tradeConfig.shape === "Ingot") { premiumPercentDecimal = 0.01; $scope.premiumPercentDisplay = 1; }
        if($scope.tradeConfig.shape === "Jewelry") { premiumPercentDecimal = 0.15; $scope.premiumPercentDisplay = 15; }

        $scope.tradePremium = $scope.tradeBaseVal * premiumPercentDecimal;
        $scope.tradeTax = ($scope.tradeBaseVal + $scope.tradePremium) * 0.03; 
        $scope.tradeTotalCost = $scope.tradeBaseVal + $scope.tradePremium + $scope.tradeTax;
    };

    $scope.buyGold = function() {
        if($scope.tradeConfig.qty < 1) return alert("Minimum purchase is 1 Gram.");
        if(!confirm(`Do you want to finalize the purchase of ${$scope.tradeConfig.qty}g of ${$scope.tradeConfig.purity}K ${$scope.tradeConfig.shape}?`)) return;
        
        const payload = { 
            userName: $scope.currentUser.name, 
            email: $scope.currentUser.email, 
            quantity: $scope.tradeConfig.qty,
            purity: $scope.tradeConfig.purity,
            shape: $scope.tradeConfig.shape,
            totalCostINR: $scope.tradeTotalCost,
            userNote: $scope.tradeConfig.userNote 
        };
        
        $http.post('/api/buy', payload).then(function(res) {
            alert("Transaction Successful! Your physical gold is securely allocated. Check your Vault History below.");
            $scope.tradeConfig.qty = $scope.availableWeights[$scope.tradeConfig.shape][0]; 
            $scope.tradeConfig.userNote = ""; 
            $scope.calcTrade();
            $scope.fetchUserOrders(); 
        }).catch(function(err) {
            alert("Financial transaction failed. Please contact support.");
        });
    };

    // ==========================================
    // DATABASE ADMIN (CRUD & ORDER CONTROLS)
    // ==========================================
    $scope.adminUnlocked = false;
    $scope.adminTab = 'ledger'; 
    $scope.admin = { pwd: '' }; 
    $scope.logs = [];
    $scope.orders = [];
    $scope.registeredUsers = []; 
    $scope.selectedOrder = {}; 

    $scope.unlockAdmin = function() {
        if(!$scope.admin.pwd) { return alert("Enter password."); }
        
        $http.post('/api/admin-login', { password: $scope.admin.pwd }).then(function(res) {
            $scope.adminUnlocked = true;
            $scope.admin.pwd = ''; 
            $scope.fetchAdminData();
        }).catch(function(err) {
            alert("ACCESS DENIED: Incorrect Admin Password");
        });
    };

    $scope.fetchAdminData = function() {
        $http.get('/api/logs').then(function(res) { $scope.logs = res.data; });
        $http.get('/api/orders').then(function(res) { $scope.orders = res.data; });
        $http.get('/api/users').then(function(res) { $scope.registeredUsers = res.data; });
    };

    $scope.viewOrderDetails = function(order) {
        $scope.selectedOrder = order;
    };

    $scope.updateOrderStatus = function(order, newStatus) {
        let adminMessage = prompt(`Enter an optional note to display in the investor's vault regarding status: ${newStatus}\n(Leave blank for no note)`);
        if (adminMessage === null) return; 
        const payload = { status: newStatus, note: adminMessage };
        $http.put('/api/orders/' + order._id + '/status', payload).then(function(res) {
            alert(`Order status successfully updated to "${newStatus}". The investor's vault has been updated.`);
            $scope.fetchAdminData(); 
        }).catch(function(err) {
            console.error("Status Update Error:", err);
            alert("Failed to update status.");
        });
    };

    $scope.newLog = { action: '', details: '' };

    $scope.createLog = function() {
        if(!$scope.newLog.action || !$scope.newLog.details) {
            return alert('Please enter Action and Details.');
        }
        $http.post('/api/log', $scope.newLog).then(function(res) {
            $scope.newLog = { action: '', details: '' }; 
            $scope.fetchAdminData(); 
        });
    };

    $scope.editLog = function(log) {
        log.isEditing = true;
        log.editAction = log.action; 
        log.editDetails = log.details;
    };

    $scope.saveUpdate = function(log) {
        const payload = { action: log.editAction, details: log.editDetails };
        $http.put('/api/logs/' + log._id, payload).then(function(res) {
            log.isEditing = false;
            log.action = log.editAction; 
            log.details = log.editDetails;
        });
    };

    $scope.deleteLog = function(id) {
        if(confirm("CRITICAL WARNING: Are you sure you want to permanently delete this record?")) {
            $http.delete('/api/logs/' + id).then(function(res) {
                $scope.fetchAdminData(); 
            });
        }
    };

    // ==========================================
    // LIVE DATA STREAMING & CONVERSION MATH
    // ==========================================
    $scope.apiConnected = false;
    $scope.basePricePerGramINR = 14600; 
    
    $scope.rates = { 'USD': 1, 'INR': 83.50, 'EUR': 0.92, 'GBP': 0.78, 'JPY': 150.00, 'AUD': 1.53, 'CAD': 1.35 };
    
    $scope.currencyNames = {
        'AUD': 'Australian Dollar', 'BGN': 'Bulgarian Lev', 'BRL': 'Brazilian Real', 
        'CAD': 'Canadian Dollar', 'CHF': 'Swiss Franc', 'CNY': 'Chinese Yuan', 
        'CZK': 'Czech Koruna', 'DKK': 'Danish Krone', 'EUR': 'Euro', 
        'GBP': 'British Pound', 'HKD': 'Hong Kong Dollar', 'HUF': 'Hungarian Forint', 
        'IDR': 'Indonesian Rupiah', 'ILS': 'Israeli New Shekel', 'INR': 'Indian Rupee', 
        'ISK': 'Icelandic Króna', 'JPY': 'Japanese Yen', 'KRW': 'South Korean Won', 
        'MXN': 'Mexican Peso', 'MYR': 'Malaysian Ringgit', 'NOK': 'Norwegian Krone', 
        'NZD': 'New Zealand Dollar', 'PHP': 'Philippine Peso', 'PLN': 'Polish Zloty', 
        'RON': 'Romanian Leu', 'SEK': 'Swedish Krona', 'SGD': 'Singapore Dollar', 
        'THB': 'Thai Baht', 'TRY': 'Turkish Lira', 'USD': 'United States Dollar', 
        'ZAR': 'South African Rand'
    };
    
    $scope.userQuantity = 1;
    $scope.userUnit = 'g';
    $scope.goldValueINR = 0; 
    $scope.goldValueUSD = 0;
    
    $scope.currAmount = 1000; 
    $scope.currFrom = 'USD'; 
    $scope.currTo = 'INR';
    $scope.currResult = 0;

    $scope.calcGold = function() {
        let grams = 0;
        if ($scope.userUnit === 'oz') { grams = $scope.userQuantity * 31.1035; } 
        else if ($scope.userUnit === 'tola') { grams = $scope.userQuantity * 10; } 
        else { grams = $scope.userQuantity; }
        
        $scope.goldValueINR = grams * $scope.basePricePerGramINR;
        $scope.goldValueUSD = $scope.goldValueINR / $scope.rates['INR'];
    };

    $scope.calcCurrency = function() {
        $scope.currResult = ($scope.currAmount / $scope.rates[$scope.currFrom]) * $scope.rates[$scope.currTo];
    };

    $http.get('/api/live-market').then(function(res) {
        $scope.apiConnected = true;
        $scope.rates = res.data.rates;
        $scope.basePricePerGramINR = res.data.pricePerGramINR;
        
        $scope.calcGold(); 
        $scope.calcCurrency();
        
        if($scope.currentUser) {
            $scope.calcTrade();
        }
        
        $scope.adjustChartsToLivePrice(res.data.pricePerGramINR);

    }).catch(function(e) {
        $scope.apiConnected = false;
        $scope.calcGold(); 
        $scope.calcCurrency();
    });

    // ==========================================
    // CANVAS RENDERING & CHART.JS INITIALIZATION
    // ==========================================
    let arimaChartInstance = null; 
    let lstmChartInstance = null;
    $scope.adminPreviewChartInstance = null; 

    $scope.masterData = { rawDates: [], dates: [], actual: [], arima: [], lstm: [] };
    
    let startDate = new Date(2012, 0, 1);
    let endDate = new Date(2026, 2, 22);
    let days = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
    let simPrice = 3000; 
    let trend = (14600 - 3000) / days; 

    for(let i = 0; i < days; i++) {
        let d = new Date(startDate);
        d.setDate(d.getDate() + i);
        
        $scope.masterData.rawDates.push(d);
        $scope.masterData.dates.push(d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }));
        
        let volatility = (Math.random() - 0.49) * 40; 
        simPrice += trend + volatility;
        
        $scope.masterData.actual.push(simPrice);
        $scope.masterData.arima.push(simPrice * 0.96 + (Math.random() * 200));
        $scope.masterData.lstm.push(simPrice * 0.995 + ((Math.random() - 0.5) * 50));
    }

    $scope.adjustChartsToLivePrice = function(livePrice) {
        let endOfChartPrice = $scope.masterData.actual[$scope.masterData.actual.length - 1];
        let priceDifference = livePrice - endOfChartPrice;
        
        for(let i = 0; i < $scope.masterData.actual.length; i++) {
             $scope.masterData.actual[i] += priceDifference;
             $scope.masterData.arima[i] += priceDifference;
             $scope.masterData.lstm[i] += priceDifference;
        }
        
        if($scope.currentView === 'dashboard') {
            $scope.setTimeframe($scope.activeTimeframe);
        }
    };

    $scope.activeTimeframe = '1Y';
    $scope.years = []; 
    for(let y = 2012; y <= 2026; y++) { $scope.years.push(y); }
    
    $scope.months = [
        {val:0, name:'January'}, {val:1, name:'February'}, {val:2, name:'March'}, 
        {val:3, name:'April'}, {val:4, name:'May'}, {val:5, name:'June'}, 
        {val:6, name:'July'}, {val:7, name:'August'}, {val:8, name:'September'}, 
        {val:9, name:'October'}, {val:10, name:'November'}, {val:11, name:'December'}
    ];
    $scope.selYear = 2026; 
    $scope.selMonth = 2;

    $scope.setTimeframe = function(timeframe) {
        $scope.activeTimeframe = timeframe;
        let slice = 0;
        
        if(timeframe === '1M') { slice = 30; } 
        else if(timeframe === '6M') { slice = 180; } 
        else if(timeframe === '1Y') { slice = 365; } 
        else if(timeframe === '5Y') { slice = 1825; } 
        else if(timeframe === 'MAX') { slice = $scope.masterData.dates.length; }

        $scope.updateCharts(
            $scope.masterData.dates.slice(-slice), 
            $scope.masterData.actual.slice(-slice), 
            $scope.masterData.arima.slice(-slice), 
            $scope.masterData.lstm.slice(-slice)
        );

        let identifier = $scope.currentUser ? $scope.currentUser.name : "Guest";
        $http.post('/api/log', { action: 'Chart Viewed', details: `User: ${identifier} | Timeframe: ${timeframe}` });
    };

    $scope.filterSpecificMonth = function() {
        $scope.activeTimeframe = 'CUSTOM';
        let fDates=[], fActual=[], fArima=[], fLstm=[];
        let monthName = $scope.months.find(m => m.val === $scope.selMonth).name;
        
        for(let i = 0; i < $scope.masterData.rawDates.length; i++) {
            let d = $scope.masterData.rawDates[i];
            if(d.getFullYear() === $scope.selYear && d.getMonth() === $scope.selMonth) {
                fDates.push($scope.masterData.dates[i]); 
                fActual.push($scope.masterData.actual[i]);
                fArima.push($scope.masterData.arima[i]); 
                fLstm.push($scope.masterData.lstm[i]);
            }
        }
        
        if(fDates.length === 0) return alert("Database Notification: No trading data available for this specific month.");
        $scope.updateCharts(fDates, fActual, fArima, fLstm);

        let identifier = $scope.currentUser ? $scope.currentUser.name : "Guest";
        $http.post('/api/log', { action: 'Chart Viewed', details: `User: ${identifier} | Custom: ${monthName} ${$scope.selYear}` });
    };

    $scope.previewLogChart = function(log) {
        let slice = 365; 
        if (log.details.includes('1M')) slice = 30;
        else if (log.details.includes('6M')) slice = 180;
        else if (log.details.includes('1Y')) slice = 365;
        else if (log.details.includes('5Y')) slice = 1825;
        else if (log.details.includes('MAX')) slice = $scope.masterData.dates.length;
        
        let pDates = $scope.masterData.dates.slice(-slice);
        let pActual = $scope.masterData.actual.slice(-slice);
        let pArima = $scope.masterData.arima.slice(-slice);

        var myModal = new bootstrap.Modal(document.getElementById('adminChartModal'));
        myModal.show();
        
        $timeout(function() {
            const ctx = document.getElementById('adminPreviewChart').getContext('2d');
            if ($scope.adminPreviewChartInstance) $scope.adminPreviewChartInstance.destroy();
            
            $scope.adminPreviewChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: pDates,
                    datasets: [
                        { label: 'Actual Price', data: pActual, borderColor: '#ffffff', borderWidth: 2, tension: 0 },
                        { label: 'ARIMA Model', data: pArima, borderColor: '#DAA520', borderWidth: 2, borderDash: [5,5], tension: 0 }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, elements: { point: { radius: 0 } }, plugins: { legend: { labels: { color: '#ffffff' } } }, scales: { x: { ticks: { color: '#ffffff' } }, y: { ticks: { color: '#ffffff' } } } }
            });
        }, 300); 
    };

    $scope.updateCharts = function(dates, actual, arima, lstm) {
        if(document.getElementById('arimaChart') === null) return; 
        
        const gridColor = $scope.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        const tickColor = $scope.isDarkMode ? '#e2e8f0' : '#212529';
        const actualLineColor = $scope.isDarkMode ? '#ffffff' : '#000000';

        const opts = { 
            responsive: true, maintainAspectRatio: false, elements: { point: { radius: 0 } }, 
            interaction: { mode: 'index', intersect: false }, 
            scales: { 
                x: { grid: { color: gridColor }, ticks: { color: tickColor, maxTicksLimit: 6 } }, 
                y: { grid: { color: gridColor }, ticks: { color: tickColor } } 
            } 
        };

        const ctxArima = document.getElementById('arimaChart').getContext('2d');
        if (arimaChartInstance) arimaChartInstance.destroy();
        arimaChartInstance = new Chart(ctxArima, { 
            type: 'line', 
            data: { labels: dates, datasets: [ { label: 'Actual Ground Truth Price', data: actual, borderColor: actualLineColor, borderWidth: 2, tension: 0 }, { label: 'ARIMA Statistical Model', data: arima, borderColor: '#DAA520', borderWidth: 2, borderDash: [5, 5], tension: 0 } ] }, 
            options: opts 
        });

        const ctxLstm = document.getElementById('lstmChart').getContext('2d');
        if (lstmChartInstance) lstmChartInstance.destroy();
        lstmChartInstance = new Chart(ctxLstm, { 
            type: 'line', 
            data: { labels: dates, datasets: [ { label: 'Actual Ground Truth Price', data: actual, borderColor: actualLineColor, borderWidth: 2, tension: 0 }, { label: 'LSTM Deep Network', data: lstm, borderColor: '#198754', borderWidth: 2, borderDash: [5, 5], tension: 0 } ] }, 
            options: opts 
        });
    };
});
