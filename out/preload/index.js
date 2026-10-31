let electron = require("electron");
// src/preload/index.ts
var api = {
	login: (payload) => electron.ipcRenderer.invoke("auth:login", payload),
	listUsers: () => electron.ipcRenderer.invoke("users:list"),
	saveUser: (data) => electron.ipcRenderer.invoke("users:save", data),
	deleteUser: (id) => electron.ipcRenderer.invoke("users:delete", id),
	listCustomers: (search) => electron.ipcRenderer.invoke("customers:list", search),
	findCustomerByPhone: (phone) => electron.ipcRenderer.invoke("customers:findByPhone", phone),
	saveCustomer: (data) => electron.ipcRenderer.invoke("customers:save", data),
	deleteCustomer: (id) => electron.ipcRenderer.invoke("customers:delete", id),
	getCustomerAppliances: (customerId) => electron.ipcRenderer.invoke("customers:appliances", customerId),
	listTechnicians: () => electron.ipcRenderer.invoke("technicians:list"),
	saveTechnician: (data) => electron.ipcRenderer.invoke("technicians:save", data),
	deleteTechnician: (id) => electron.ipcRenderer.invoke("technicians:delete", id),
	listSpareParts: (search) => electron.ipcRenderer.invoke("parts:list", search),
	saveSparePart: (data) => electron.ipcRenderer.invoke("parts:save", data),
	deleteSparePart: (id) => electron.ipcRenderer.invoke("parts:delete", id),
	recordInventoryMovement: (payload) => electron.ipcRenderer.invoke("inventory:movement", payload),
	listInventoryMovements: () => electron.ipcRenderer.invoke("inventory:list"),
	listTickets: (filters) => electron.ipcRenderer.invoke("tickets:list", filters),
	saveTicket: (data) => electron.ipcRenderer.invoke("tickets:save", data),
	deleteTicket: (id) => electron.ipcRenderer.invoke("tickets:delete", id),
	listTreasuryTransactions: () => electron.ipcRenderer.invoke("treasury:list"),
	addTreasuryTransaction: (data) => electron.ipcRenderer.invoke("treasury:add", data),
	deleteTreasuryTransaction: (id) => electron.ipcRenderer.invoke("treasury:delete", id),
	getAppVersion: () => electron.ipcRenderer.invoke("app:version"),
	getDashboardStats: () => electron.ipcRenderer.invoke("dashboard:stats"),
	getSettings: () => electron.ipcRenderer.invoke("settings:get"),
	saveSettings: (settings) => electron.ipcRenderer.invoke("settings:save", settings),
	getDatabasePath: () => electron.ipcRenderer.invoke("db:path"),
	createBackup: () => electron.ipcRenderer.invoke("backup:create"),
	restoreBackup: () => electron.ipcRenderer.invoke("backup:restore"),
	openExternal: (url) => electron.ipcRenderer.invoke("shell:openExternal", url)
};
if (process.contextIsolated) try {
	electron.contextBridge.exposeInMainWorld("api", api);
} catch (error) {
	console.error(error);
}
else window.api = api;
