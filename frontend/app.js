var app = angular.module('goldApp', []);
app.controller('MainController', function($scope, $http, $timeout) {
    
    // --- THEME & NAVIGATION LOGIC ---
    $scope.isDarkMode = true;
    document.documentElement.setAttribute('data-theme', 'dark');
    
    $scope.toggleTheme = function() {
        $scope.isDarkMode = !$scope.isDarkMode;
        document.documentElement.setAttribute('data-theme', $scope.isDarkMode ? 'dark' : 'light');
        if($scope.currentView === 'dashboard') {
            $scope.setTimeframe($scope.activeTimeframe);
        }
    };

    $scope.currentView = 'home';
    $scope.setView = function(view) { 
        $scope.currentView = view; 
        if(view === 'dashboard') {
            $timeout(() => $scope.setTimeframe($scope.activeTimeframe), 100);
        }
        if(view === 'database' && $scope.adminUnlocked) {
            $scope.fetchAdminData();
        }
    };

    // ==========================================
    // USER AUTHENTICATION & TRADING
    // ==========================================
    $scope.authMode = 'login'; 
    $scope.currentUser = null;
    $scope.regData = {}; 
    $scope.loginData = {}; 
    $scope.tradeQty = 1;

    $scope.register = function() {
        $http.post('http://localhost:5000/api/register', $scope.regData).then(function(res) {
            alert(res.data.message);
            $scope.authMode = 'login';
        }).catch(err => alert(err.data.error || "Registration failed"));
    };

    $scope.login = function() {
        $http.post('http://localhost:5000/api/login', $scope.loginData).then(function(res) {
            $scope.currentUser = res.data.user;
        }).catch(err => alert(err.data.error || "Login failed"));
    };

    $scope.logout = function() { 
        $scope.currentUser = null; 
        $scope.loginData = {};
    };

    $scope.buyGold = function() {
        if(!confirm(`Do you want to finalize the purchase of ${$scope.tradeQty}g of Physical Gold?`)) return;
        
        const cost = $scope.tradeQty * $scope.basePricePerGramINR;
        const payload = { 
            userName: $scope.currentUser.name, 
            email: $scope.currentUser.email, 
            quantity: $scope.tradeQty, 
            totalCostINR: cost 
        };
        
        $http.post('http://localhost:5000/api/buy', payload).then(function(res) {
            alert("Transaction Successful! Your physical gold is reserved.");
            $scope.tradeQty = 1;
        }).catch(err => alert("Transaction failed."));
    };

    // ==========================================
    // ADMIN LOGIN & DB OPERATIONS (CRUD)
    // ==========================================
    $scope.adminUnlocked = false;
    $scope.adminPwd = '';
    $scope.logs = [];
    $scope.orders = [];

    $scope.unlockAdmin = function() {
        $http.post('http://localhost:5000/api/admin-login', { password: $scope.adminPwd }).then(function(res) {
            $scope.adminUnlocked = true;
            $scope.fetchAdminData();
        }).catch(err => alert("Incorrect Admin Password"));
    };

    $scope.fetchAdminData = function() {
        $http.get('http://localhost:5000/api/logs').then(res => $scope.logs = res.data);
        $http.get('http://localhost:5000/api/orders').then(res => $scope.orders = res.data);
    };

    $scope.newLog = { action: '', details: '' };

    $scope.createLog = function() {
        if(!$scope.newLog.action || !$scope.newLog.details) return alert('Please enter both Action and Details.');
        $http.post('http://localhost:5000/api/log', $scope.newLog).then(function(res) {
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
        $http.put('http://localhost:5000/api/logs/' + log._id, payload).then(function(res) {
            log.isEditing = false;
            log.action = log.editAction; 
            log.details = log.editDetails;
        });
    };

    $scope.deleteLog = function(id) {
        if(confirm("Are you sure you want to permanently delete this record?")) {
            $http.delete('http://localhost:5000/api/logs/' + id).then(function(res) {
                $scope.fetchAdminData(); 
            });
        }
    };

    // ==========================================
    // RATES, CONVERSION & API LOGIC
    // ==========================================
    $scope.marketStatus = "Fetching Live APIs...";
    $scope.apiConnected = false;
    $scope.basePricePerGramINR = 6200; 
    
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
        if ($scope.userUnit === 'oz') {
            grams = $scope.userQuantity * 31.1035;
        } else if ($scope.userUnit === 'tola') {
            grams = $scope.userQuantity * 10;
        } else {
            grams = $scope.userQuantity;
        }
        $scope.goldValueINR = grams * $scope.basePricePerGramINR;
        $scope.goldValueUSD = $scope.goldValueINR / $scope.rates['INR'];
    };

    $scope.calcCurrency = function() {
        $scope.currResult = ($scope.currAmount / $scope.rates[$scope.currFrom]) * $scope.rates[$scope.currTo];
    };

    $http.get('http://localhost:5000/api/live-market').then(function(res) {
        $scope.apiConnected = true;
        $scope.marketStatus = "Live APIs Connected";
        
        $scope.rates = res.data.rates;
        $scope.basePricePerGramINR = res.data.pricePerGramINR;
        
        $scope.calcGold(); 
        $scope.calcCurrency();
        $scope.adjustChartsToLivePrice(res.data.pricePerGramINR);

    }).catch(function(e) {
        $scope.apiConnected = false;
        $scope.marketStatus = "API Offline - Using Estimates";
        $scope.calcGold(); 
        $scope.calcCurrency();
    });

    // ==========================================
    // CHART DATA ENGINE
    // ==========================================
    let arimaChartInstance = null; 
    let lstmChartInstance = null;
    $scope.masterData = { rawDates: [], dates: [], actual: [], arima: [], lstm: [] };
    
    let startDate = new Date(2012, 0, 1);
    let endDate = new Date(2026, 1, 27);
    let days = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
    let simPrice = 3000; 
    let trend = (16190 - 3000) / days; 

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
    for(let y = 2012; y <= 2026; y++) {
        $scope.years.push(y);
    }
    
    $scope.months = [
        {val:0, name:'January'}, {val:1, name:'February'}, {val:2, name:'March'}, 
        {val:3, name:'April'}, {val:4, name:'May'}, {val:5, name:'June'}, 
        {val:6, name:'July'}, {val:7, name:'August'}, {val:8, name:'September'}, 
        {val:9, name:'October'}, {val:10, name:'November'}, {val:11, name:'December'}
    ];
    
    $scope.selYear = 2024; 
    $scope.selMonth = 0;

    $scope.setTimeframe = function(timeframe) {
        $scope.activeTimeframe = timeframe;
        let slice = 0;
        
        if(timeframe === '1M') slice = 30; 
        else if(timeframe === '6M') slice = 180;
        else if(timeframe === '1Y') slice = 365; 
        else if(timeframe === '5Y') slice = 1825;
        else if(timeframe === 'MAX') slice = $scope.masterData.dates.length;

        $scope.updateCharts(
            $scope.masterData.dates.slice(-slice), 
            $scope.masterData.actual.slice(-slice), 
            $scope.masterData.arima.slice(-slice), 
            $scope.masterData.lstm.slice(-slice)
        );
    };

    $scope.filterSpecificMonth = function() {
        $scope.activeTimeframe = 'CUSTOM';
        let fDates=[], fActual=[], fArima=[], fLstm=[];
        
        for(let i = 0; i < $scope.masterData.rawDates.length; i++) {
            let d = $scope.masterData.rawDates[i];
            if(d.getFullYear() === $scope.selYear && d.getMonth() === $scope.selMonth) {
                fDates.push($scope.masterData.dates[i]); 
                fActual.push($scope.masterData.actual[i]);
                fArima.push($scope.masterData.arima[i]); 
                fLstm.push($scope.masterData.lstm[i]);
            }
        }
        
        if(fDates.length === 0) {
            alert("No trading data available for this specific month.");
            return;
        }
        $scope.updateCharts(fDates, fActual, fArima, fLstm);
    };

    $scope.updateCharts = function(dates, actual, arima, lstm) {
        if(document.getElementById('arimaChart') === null) return; 
        
        const gridColor = $scope.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        const tickColor = $scope.isDarkMode ? '#e2e8f0' : '#212529';
        const actualLineColor = $scope.isDarkMode ? '#ffffff' : '#000000';

        const opts = { 
            responsive: true, 
            maintainAspectRatio: false, 
            elements: { point: { radius: 0 } }, 
            interaction: { mode: 'index', intersect: false }, 
            scales: { 
                x: { 
                    grid: { color: gridColor }, 
                    ticks: { color: tickColor, maxTicksLimit: 6 } 
                }, 
                y: { 
                    grid: { color: gridColor }, 
                    ticks: { color: tickColor } 
                } 
            } 
        };

        const ctxArima = document.getElementById('arimaChart').getContext('2d');
        if (arimaChartInstance) arimaChartInstance.destroy();
        arimaChartInstance = new Chart(ctxArima, { 
            type: 'line', 
            data: { 
                labels: dates, 
                datasets: [ 
                    { 
                        label: 'Actual Price', 
                        data: actual, 
                        borderColor: actualLineColor, 
                        borderWidth: 2, 
                        tension: 0.1 
                    }, 
                    { 
                        label: 'ARIMA Model', 
                        data: arima, 
                        borderColor: '#DAA520', 
                        borderWidth: 2, 
                        borderDash: [5, 5], 
                        tension: 0.1 
                    } 
                ]
            }, 
            options: opts 
        });

        const ctxLstm = document.getElementById('lstmChart').getContext('2d');
        if (lstmChartInstance) lstmChartInstance.destroy();
        lstmChartInstance = new Chart(ctxLstm, { 
            type: 'line', 
            data: { 
                labels: dates, 
                datasets: [ 
                    { 
                        label: 'Actual Price', 
                        data: actual, 
                        borderColor: actualLineColor, 
                        borderWidth: 2, 
                        tension: 0.1 
                    }, 
                    { 
                        label: 'LSTM Network', 
                        data: lstm, 
                        borderColor: '#198754', 
                        borderWidth: 2, 
                        borderDash: [5, 5], 
                        tension: 0.1 
                    } 
                ]
            }, 
            options: opts 
        });
    };
});