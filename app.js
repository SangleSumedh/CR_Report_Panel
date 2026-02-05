import { db, auth } from './firebase-config.js';
import { collection, addDoc, getDocs, query, orderBy, limit, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

class MISReportingEngine {
    constructor() {
        this.currentChart = null;
        this.teamChart = null;
        this.collectionName = 'employee_operations';
        
        // Auth Protection
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                window.location.href = 'login.html';
            } else {
                this.currentUser = user;
                
                // Check Role
                try {
                    const { doc, getDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                    
                    // 1. Direct Email Check (Fallback/Fast Path)
                    const userEmail = user.email.toLowerCase();
                    const adminBtn = document.getElementById('adminBtn');
                    
                    if (userEmail === 'sanglesumedh15@gmail.com') {
                        console.log("Superadmin detected via email.");
                        if(adminBtn) adminBtn.classList.remove('hidden');
                        
                        // Ensure role is set in DB if missing
                        const userRef = doc(db, 'users', user.uid);
                        // We do this in background
                        getDoc(userRef).then(snap => {
                            if (!snap.exists() || snap.data().role !== 'superadmin') {
                                setDoc(userRef, { email: userEmail, role: 'superadmin' }, { merge: true });
                            }
                        });
                    } 
                    // 2. Firestore Role Check
                    else {
                        const userDoc = await getDoc(doc(db, 'users', user.uid));
                        if (userDoc.exists()) {
                            const role = userDoc.data().role;
                            console.log("User Role:", role);
                            if (role === 'superadmin' || role === 'admin') {
                                if(adminBtn) adminBtn.classList.remove('hidden');
                            }
                        }
                    }
                } catch (e) {
                    console.error("Role check failed", e);
                }

                this.init();
            }
        });
    }

    init() {
        this.setupEventListeners();
        this.loadDashboard();
        this.setDefaultDates();
        this.setupLogout();
    }

    setupEventListeners() {
        // Navigation
        document.getElementById('dataEntryBtn').addEventListener('click', () => this.showDataEntry());
        document.getElementById('reportsBtn').addEventListener('click', () => this.showReports());
        document.getElementById('cancelEntry').addEventListener('click', () => this.showDashboard());

        // Form submission
        document.getElementById('dataEntryForm').addEventListener('submit', (e) => this.handleDataEntry(e));

        // Report generation
        document.getElementById('generateReport').addEventListener('click', () => this.generateReport());
        
        // Excel Export
        const exportBtn = document.getElementById('exportExcelBtn');
        if(exportBtn) {
            exportBtn.addEventListener('click', () => this.exportReportToExcel());
        }

        // Auto-calculate connection rate
        document.getElementById('freshCalls').addEventListener('input', () => this.validateConnectionRate());
        document.getElementById('freshCallsConnected').addEventListener('input', () => this.validateConnectionRate());
    }

    setupLogout() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                signOut(auth).then(() => {
                    window.location.href = 'login.html';
                });
            });
        }
    }

    setDefaultDates() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('entryDate').value = today;
        document.getElementById('startDate').value = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        document.getElementById('endDate').value = today;
    }

    showLoading() {
        document.getElementById('loadingSpinner').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingSpinner').classList.add('hidden');
    }

    showDataEntry() {
        document.getElementById('dashboard').classList.add('hidden');
        document.getElementById('dataEntry').classList.remove('hidden');
        document.getElementById('reportsSection').classList.add('hidden');
    }

    showReports() {
        document.getElementById('dashboard').classList.add('hidden');
        document.getElementById('dataEntry').classList.add('hidden');
        document.getElementById('reportsSection').classList.remove('hidden');
    }

    showDashboard() {
        document.getElementById('dashboard').classList.remove('hidden');
        document.getElementById('dataEntry').classList.add('hidden');
        document.getElementById('reportsSection').classList.add('hidden');
        this.loadDashboard();
    }

    validateConnectionRate() {
        const freshCalls = parseInt(document.getElementById('freshCalls').value) || 0;
        const connected = parseInt(document.getElementById('freshCallsConnected').value) || 0;
        
        if (connected > freshCalls) {
            document.getElementById('freshCallsConnected').setCustomValidity('Cannot exceed fresh calls');
        } else {
            document.getElementById('freshCallsConnected').setCustomValidity('');
        }
    }

    async handleDataEntry(e) {
        e.preventDefault();
        this.showLoading();

        try {
            const formData = this.collectFormData();
            
            // Firestore data save
            const docRef = await addDoc(collection(db, this.collectionName), formData);
            console.log("Document written with ID: ", docRef.id);

            alert('Data saved successfully!');
            document.getElementById('dataEntryForm').reset();
            this.setDefaultDates();
            this.showDashboard();
        
        } catch (error) {
            console.error('Error saving data:', error);
            alert('Error saving data. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    collectFormData() {
        const companyNames = document.getElementById('companyNames').value
            .split(',')
            .map(name => name.trim())
            .filter(name => name.length > 0);

        return {
            date: new Date(document.getElementById('entryDate').value).toISOString(),
            employee_name: document.getElementById('employeeName').value.trim(),
            team: document.getElementById('team').value,
            calls_made: parseInt(document.getElementById('callsMade').value) || 0,
            fresh_calls: parseInt(document.getElementById('freshCalls').value) || 0,
            operational_calls: parseInt(document.getElementById('operationalCalls').value) || 0,
            fresh_calls_connected: parseInt(document.getElementById('freshCallsConnected').value) || 0,
            invite_mails_sent: parseInt(document.getElementById('inviteMailsSent').value) || 0,
            jd_received: parseInt(document.getElementById('jdReceived').value) || 0,
            company_names: companyNames,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    }

    async loadDashboard() {
        this.showLoading();
        try {
            // Firestore query: sort by date, limit 100
            const q = query(
                collection(db, this.collectionName),
                orderBy("date"),
                limit(100)
            );

            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => doc.data());
            
            this.updateMetrics(data);
            this.updateCharts(data);
        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.showNoDataMessage();
        } finally {
            this.hideLoading();
        }
    }

    updateMetrics(records) {
        const metricsGrid = document.getElementById('metricsGrid');
        
        if (!records || records.length === 0) {
            metricsGrid.innerHTML = '<div class="col-span-4 text-center text-gray-500">No data available</div>';
            return;
        }

        const totals = this.calculateTotals(records);
        const connectionRate = totals.freshCalls > 0 ? ((totals.freshCallsConnected / totals.freshCalls) * 100).toFixed(1) : 0;

        metricsGrid.innerHTML = `
            <div class="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white metric-card">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-blue-100 text-sm">Total Calls</p>
                        <p class="text-3xl font-bold">${totals.callsMade.toLocaleString()}</p>
                    </div>
                    <i class="fas fa-phone text-4xl text-blue-200"></i>
                </div>
            </div>
            
            <div class="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white metric-card">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-green-100 text-sm">Fresh Calls</p>
                        <p class="text-3xl font-bold">${totals.freshCalls.toLocaleString()}</p>
                    </div>
                    <i class="fas fa-user-plus text-4xl text-green-200"></i>
                </div>
            </div>
            
            <div class="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white metric-card">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-purple-100 text-sm">Connection Rate</p>
                        <p class="text-3xl font-bold">${connectionRate}%</p>
                    </div>
                    <i class="fas fa-chart-line text-4xl text-purple-200"></i>
                </div>
            </div>
            
            <div class="bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg p-6 text-white metric-card">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-orange-100 text-sm">JD Received</p>
                        <p class="text-3xl font-bold">${totals.jdReceived.toLocaleString()}</p>
                    </div>
                    <i class="fas fa-file-alt text-4xl text-orange-200"></i>
                </div>
            </div>
        `;
    }

    calculateTotals(records) {
        return {
            callsMade: records.reduce((sum, record) => sum + (record.calls_made || 0), 0),
            freshCalls: records.reduce((sum, record) => sum + (record.fresh_calls || 0), 0),
            operationalCalls: records.reduce((sum, record) => sum + (record.operational_calls || 0), 0),
            freshCallsConnected: records.reduce((sum, record) => sum + (record.fresh_calls_connected || 0), 0),
            inviteMailsSent: records.reduce((sum, record) => sum + (record.invite_mails_sent || 0), 0),
            jdReceived: records.reduce((sum, record) => sum + (record.jd_received || 0), 0)
        };
    }

    updateCharts(records) {
        if (!records || records.length === 0) return;

        this.createDailyChart(records);
        this.createTeamChart(records);
    }

    createDailyChart(records) {
        const ctx = document.getElementById('dailyChart').getContext('2d');
        
        // Group by date and calculate daily totals
        const dailyData = this.groupByDate(records);
        const dates = Object.keys(dailyData).sort();
        const callsData = dates.map(date => dailyData[date].callsMade);
        const freshCallsData = dates.map(date => dailyData[date].freshCalls);

        if (this.currentChart) {
            this.currentChart.destroy();
        }

        this.currentChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates.map(date => new Date(date).toLocaleDateString()),
                datasets: [{
                    label: 'Total Calls',
                    data: callsData,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4
                }, {
                    label: 'Fresh Calls',
                    data: freshCallsData,
                    borderColor: 'rgb(34, 197, 94)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    exportReportToExcel() {
        const data = this.currentReportData;
        if (!data || data.length === 0) {
            alert("No data to export. Please generate a report first.");
            return;
        }

        // Prepare data for export
        const exportData = data.map(record => ({
            Date: new Date(record.date).toLocaleDateString(),
            Employee: record.employee_name,
            Team: record.team,
            "Calls Made": record.calls_made,
            "Fresh Calls": record.fresh_calls,
            "Operational Calls": record.operational_calls,
            "Fresh Connected": record.fresh_calls_connected,
            "Invites Sent": record.invite_mails_sent,
            "JD Received": record.jd_received,
            "Companies": Array.isArray(record.company_names) ? record.company_names.join(", ") : record.company_names
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Report");
        
        const fileName = `MIS_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }

    createTeamChart(records) {
        const ctx = document.getElementById('teamChart').getContext('2d');
        
        // Group by team
        const teamData = this.groupByTeam(records);
        const teams = Object.keys(teamData);
        const callsData = teams.map(team => teamData[team].callsMade);

        if (this.teamChart) {
            this.teamChart.destroy();
        }

        this.teamChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: teams,
                datasets: [{
                    label: 'Total Calls by Team',
                    data: callsData,
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(34, 197, 94, 0.8)',
                        'rgba(147, 51, 234, 0.8)',
                        'rgba(249, 115, 22, 0.8)'
                    ],
                    borderColor: [
                        'rgb(59, 130, 246)',
                        'rgb(34, 197, 94)',
                        'rgb(147, 51, 234)',
                        'rgb(249, 115, 22)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    groupByDate(records) {
        const grouped = {};
        records.forEach(record => {
            const date = new Date(record.date).toISOString().split('T')[0];
            if (!grouped[date]) {
                grouped[date] = {
                    callsMade: 0,
                    freshCalls: 0
                };
            }
            grouped[date].callsMade += record.calls_made || 0;
            grouped[date].freshCalls += record.fresh_calls || 0;
        });
        return grouped;
    }

    groupByTeam(records) {
        const grouped = {};
        records.forEach(record => {
            const team = record.team || 'Unknown';
            if (!grouped[team]) {
                grouped[team] = {
                    callsMade: 0,
                    freshCalls: 0
                };
            }
            grouped[team].callsMade += record.calls_made || 0;
            grouped[team].freshCalls += record.fresh_calls || 0;
        });
        return grouped;
    }

    showNoDataMessage() {
        document.getElementById('metricsGrid').innerHTML = 
            '<div class="col-span-4 text-center text-gray-500">No data available</div>';
    }

    async generateReport() {
        const reportType = document.getElementById('reportType').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        if (!startDate || !endDate) {
            alert('Please select start and end dates');
            return;
        }

        this.showLoading();
        try {
            // Firestore query for report: sort by date, limit 1000
            const q = query(
                collection(db, this.collectionName),
                orderBy("date"),
                limit(1000)
            );
            
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => doc.data());
            
            const filteredData = this.filterDataByDateRange(data, startDate, endDate);
            this.currentReportData = filteredData; // Store for export
            this.displayReport(filteredData, reportType, startDate, endDate);
            
        } catch (error) {
            console.error('Error generating report:', error);
            alert('Error generating report. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    filterDataByDateRange(records, startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Include the entire end date

        return records.filter(record => {
            const recordDate = new Date(record.date);
            return recordDate >= start && recordDate <= end;
        });
    }

    displayReport(data, reportType, startDate, endDate) {
        const reportOutput = document.getElementById('reportOutput');
        reportOutput.classList.remove('hidden');

        if (!data || data.length === 0) {
            this.displayNoDataMessage();
            return;
        }

        this.displayExecutiveSummary(data, reportType, startDate, endDate);
        this.displayTabularSummary(data);
        this.displayKeyInsights(data);
        this.displayRecommendations(data);
    }

    displayNoDataMessage() {
        document.getElementById('executiveSummary').innerHTML = 
            '<div class="text-center text-gray-500 text-lg">No data available for the selected period.</div>';
        document.getElementById('tabularSummary').innerHTML = '';
        document.getElementById('keyInsights').innerHTML = '';
        document.getElementById('recommendations').innerHTML = '';
    }

    displayExecutiveSummary(data, reportType, startDate, endDate) {
        const totals = this.calculateTotals(data);
        const connectionRate = totals.freshCalls > 0 ? ((totals.freshCallsConnected / totals.freshCalls) * 100).toFixed(1) : 0;
        const uniqueEmployees = [...new Set(data.map(record => record.employee_name))].length;
        const uniqueTeams = [...new Set(data.map(record => record.team))].length;

        const summary = `
            <div class="bg-blue-50 rounded-lg p-6">
                <h3 class="text-xl font-bold text-blue-800 mb-4">Executive Summary</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="text-center">
                        <div class="text-2xl font-bold text-blue-700">${totals.callsMade.toLocaleString()}</div>
                        <div class="text-sm text-gray-600">Total Calls Made</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-green-700">${totals.freshCalls.toLocaleString()}</div>
                        <div class="text-sm text-gray-600">Fresh Calls</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-purple-700">${connectionRate}%</div>
                        <div class="text-sm text-gray-600">Connection Rate</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-orange-700">${totals.jdReceived.toLocaleString()}</div>
                        <div class="text-sm text-gray-600">JD Received</div>
                    </div>
                </div>
                <div class="mt-4 text-sm text-gray-600">
                    <strong>Period:</strong> ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()} | 
                    <strong>Employees:</strong> ${uniqueEmployees} | 
                    <strong>Teams:</strong> ${uniqueTeams}
                </div>
            </div>
        `;
        
        document.getElementById('executiveSummary').innerHTML = summary;
    }

    displayTabularSummary(data) {
        const employeeSummary = this.summarizeByEmployee(data);
        const teamSummary = this.summarizeByTeam(data);
        const totals = this.calculateTotals(data);

        let html = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <h4 class="text-lg font-semibold text-gray-800 mb-3">Employee-wise Performance</h4>
                    <div class="overflow-x-auto">
                        <table class="min-w-full bg-white border border-gray-200 rounded-lg">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Calls</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fresh</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">
        `;

        Object.entries(employeeSummary).forEach(([employee, data]) => {
            const rate = data.freshCalls > 0 ? ((data.connected / data.freshCalls) * 100).toFixed(1) : 0;
            html += `
                <tr>
                    <td class="px-4 py-2 text-sm font-medium text-gray-900">${employee}</td>
                    <td class="px-4 py-2 text-sm text-gray-500">${data.calls.toLocaleString()}</td>
                    <td class="px-4 py-2 text-sm text-gray-500">${data.freshCalls.toLocaleString()}</td>
                    <td class="px-4 py-2 text-sm text-gray-500">${rate}%</td>
                </tr>
            `;
        });

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div>
                    <h4 class="text-lg font-semibold text-gray-800 mb-3">Team-wise Performance</h4>
                    <div class="overflow-x-auto">
                        <table class="min-w-full bg-white border border-gray-200 rounded-lg">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Team</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Calls</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fresh</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">
        `;

        Object.entries(teamSummary).forEach(([team, data]) => {
            const rate = data.freshCalls > 0 ? ((data.connected / data.freshCalls) * 100).toFixed(1) : 0;
            html += `
                <tr>
                    <td class="px-4 py-2 text-sm font-medium text-gray-900">${team}</td>
                    <td class="px-4 py-2 text-sm text-gray-500">${data.calls.toLocaleString()}</td>
                    <td class="px-4 py-2 text-sm text-gray-500">${data.freshCalls.toLocaleString()}</td>
                    <td class="px-4 py-2 text-sm text-gray-500">${rate}%</td>
                </tr>
            `;
        });

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('tabularSummary').innerHTML = html;
    }

    displayKeyInsights(data) {
        const totals = this.calculateTotals(data);
        const connectionRate = totals.freshCalls > 0 ? ((totals.freshCallsConnected / totals.freshCalls) * 100).toFixed(1) : 0;
        const employeeSummary = this.summarizeByEmployee(data);
        const teamSummary = this.summarizeByTeam(data);

        // Find top performers
        const topEmployees = Object.entries(employeeSummary)
            .sort(([,a], [,b]) => b.calls - a.calls)
            .slice(0, 3);

        const topTeams = Object.entries(teamSummary)
            .sort(([,a], [,b]) => b.calls - a.calls)
            .slice(0, 2);

        let insights = `
            <div class="bg-yellow-50 rounded-lg p-6">
                <h4 class="text-lg font-semibold text-yellow-800 mb-3">Key Insights & Observations</h4>
                <ul class="space-y-2 text-sm text-gray-700">
                    <li><strong>Connection Rate:</strong> ${connectionRate}% fresh call connection rate achieved</li>
                    <li><strong>Mail Conversion:</strong> ${totals.jdReceived} JDs received from ${totals.inviteMailsSent} invitation mails sent</li>
                    <li><strong>Top Employees:</strong> ${topEmployees.map(([name]) => name).join(', ')}</li>
                    <li><strong>Top Teams:</strong> ${topTeams.map(([team]) => team).join(', ')}</li>
                </ul>
            </div>
        `;

        document.getElementById('keyInsights').innerHTML = insights;
    }

    displayRecommendations(data) {
        const totals = this.calculateTotals(data);
        const connectionRate = totals.freshCalls > 0 ? ((totals.freshCallsConnected / totals.freshCalls) * 100) : 0;
        const mailConversionRate = totals.inviteMailsSent > 0 ? ((totals.jdReceived / totals.inviteMailsSent) * 100) : 0;

        let recommendations = `
            <div class="bg-green-50 rounded-lg p-6">
                <h4 class="text-lg font-semibold text-green-800 mb-3">Actionable Recommendations</h4>
                <ul class="space-y-2 text-sm text-gray-700">
        `;

        if (connectionRate < 30) {
            recommendations += `<li><strong>Connection Rate:</strong> Low connection rate (${connectionRate.toFixed(1)}%). Consider optimizing call timing and scripts.</li>`;
        } else {
            recommendations += `<li><strong>Connection Rate:</strong> Good connection rate (${connectionRate.toFixed(1)}%). Maintain current strategies.</li>`;
        }

        if (mailConversionRate < 20) {
            recommendations += `<li><strong>Mail Conversion:</strong> Low mail conversion rate (${mailConversionRate.toFixed(1)}%). Review email templates and targeting.</li>`;
        } else {
            recommendations += `<li><strong>Mail Conversion:</strong> Good mail conversion rate (${mailConversionRate.toFixed(1)}%). Continue current approach.</li>`;
        }

        recommendations += `
                    <li><strong>Data Quality:</strong> Ensure consistent daily data entry for better insights.</li>
                </ul>
            </div>
        `;

        document.getElementById('recommendations').innerHTML = recommendations;
    }

    summarizeByEmployee(data) {
        const summary = {};
        data.forEach(record => {
            const name = record.employee_name;
            if (!summary[name]) {
                summary[name] = { calls: 0, freshCalls: 0, connected: 0 };
            }
            summary[name].calls += record.calls_made || 0;
            summary[name].freshCalls += record.fresh_calls || 0;
            summary[name].connected += record.fresh_calls_connected || 0;
        });
        return summary;
    }

    summarizeByTeam(data) {
        const summary = {};
        data.forEach(record => {
            const team = record.team;
            if (!summary[team]) {
                summary[team] = { calls: 0, freshCalls: 0, connected: 0 };
            }
            summary[team].calls += record.calls_made || 0;
            summary[team].freshCalls += record.fresh_calls || 0;
            summary[team].connected += record.fresh_calls_connected || 0;
        });
        return summary;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new MISReportingEngine();
});