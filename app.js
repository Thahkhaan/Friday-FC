const seedPlayers=["Ahmed","Ibrahim","Hassan","Mohamed","Ali","Ismail","Shafraz","Fathimath"];
const initial={
  players: seedPlayers.map((name,i)=>({id:i+1,name})),
  transactions: [
    {id: 101, playerId: 1, sessionId: 1, amount: 100.00, date: "2026-08-16 10:00"},
    {id: 102, playerId: 2, sessionId: 1, amount: 100.00, date: "2026-08-16 10:05"},
    {id: 103, playerId: 3, sessionId: 1, amount: 100.00, date: "2026-08-16 10:10"},
    {id: 104, playerId: 4, sessionId: 1, amount: 50.00, date: "2026-08-16 10:15"},
    {id: 105, playerId: 6, sessionId: 1, amount: 100.00, date: "2026-08-16 10:20"},
    {id: 106, playerId: 8, sessionId: 1, amount: 100.00, date: "2026-08-16 10:25"}
  ],
  sessions:[
    {
      id:1, 
      date:"2026-08-16", 
      location:"Henveiru Football Ground", 
      cost:800.00, 
      bookingPaidBy: "Ahmed",
      players:[1,2,3,4,5,6,7,8],
      score: { red: 5, blue: 3 },
      accolades: { topScorer: 1, superior: 3, playmaker: 2, puskas: 5, oscar: 7, punctual: 4 }
    }
  ],
  qrCode: null,
  accountNumber: "7730000000000",
  accountName: "Bathootha",
  managerPin: "1234"
};

let data = JSON.parse(localStorage.getItem("friday_fc") || localStorage.getItem("kickpay") || "null") || initial;
if (!data.transactions) data.transactions = [];
if (!data.sessions) data.sessions = [];
if (!data.accountNumber) data.accountNumber = "7730000000000";
if (!data.accountName) data.accountName = "Bathootha";
if (!data.managerPin) data.managerPin = "1234";

let selectedPlayer = null;
let currentModalPlayerId = null;
let pendingDeleteSessionId = null;

// Sorting state for All-Time Balances
let allPendingSortCol = 'name';
let allPendingSortDir = 'asc';

function save(){localStorage.setItem("friday_fc",JSON.stringify(data))}
function money(n){
  const val = Number(n) || 0;
  return "MVR " + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function current(){return data.sessions.length ? data.sessions[data.sessions.length-1] : null}
function getPlayer(id){
  if(id === "admin") return { id: "admin", name: "Admin (Manager)" };
  return data.players.find(p=>p.id==id);
}
function getPlayerName(id){ 
  if(id === "admin") return "Admin";
  const p = getPlayer(id); 
  return p ? p.name : "-"; 
}

/**
 * Equal Field Booking Cost Distribution Mathematics:
 * Calculates exact equal share per participating player in session 's'.
 * Returns s.cost / N where N is number of attending players.
 */
function share(s){
  if (!s || !s.players || !s.players.length) return 0;
  return s.cost / s.players.length;
}

// Close modals when clicking backdrop outside modal card
window.addEventListener("click", function(e) {
  if (e.target && e.target.classList && e.target.classList.contains("modal")) {
    e.target.classList.remove("active");
  }
});

// Set default date when page loads
const todayStr = new Date().toISOString().split('T')[0];
if(document.getElementById("sessionDate")) {
  document.getElementById("sessionDate").value = todayStr;
}

updateNav();
renderMatchResultsAndQR();

function updateNav() {
  const isAuth = sessionStorage.getItem("manager_authenticated") === "true";
  const isAdminActive = document.getElementById("admin").classList.contains("active");
  const navActions = document.getElementById("navActions");
  
  if (isAuth && isAdminActive) {
    navActions.innerHTML = `
      <button class="btn red" onclick="signOutManager()">Sign out of manager mode</button>
    `;
  } else {
    navActions.innerHTML = `
      <button class="btn primary" onclick="openAdmin()" title="Manager Mode">Manager</button>
    `;
  }
}

function signOutManager() {
  sessionStorage.removeItem("manager_authenticated");
  showHome();
  toast("Signed out of Manager mode");
}

function getPlayerMetrics(id) {
  const totalPaid = data.transactions.filter(t => String(t.playerId) === String(id)).reduce((sum, t) => sum + t.amount, 0);
  if(id === "admin") {
    return { totalPaid, totalCostShare: 0, balance: -totalPaid, playerSessions: [] };
  }
  const playerSessions = data.sessions.filter(s => s.players.includes(id));
  const totalCostShare = playerSessions.reduce((sum, s) => sum + share(s), 0);
  const balance = totalCostShare - totalPaid;
  return { totalPaid, totalCostShare, balance, playerSessions };
}

function getSessionBreakdown(sessionId) {
  const s = data.sessions.find(x => x.id === sessionId);
  if (!s) return {};
  const costPerPlayer = share(s);
  let breakdown = {};
  s.players.forEach(pid => { breakdown[pid] = { paid: 0, share: costPerPlayer, rem: costPerPlayer }; });

  data.players.forEach(p => {
    let unallocatedPaid = data.transactions.filter(t => String(t.playerId) === String(p.id)).reduce((sum, t) => sum + t.amount, 0);
    for (let sess of data.sessions) {
      if (!sess.players.includes(p.id)) continue;
      const sh = share(sess);
      const allocated = Math.min(unallocatedPaid, sh);
      unallocatedPaid -= allocated;
      if (sess.id === sessionId && breakdown[p.id]) {
        breakdown[p.id].paid = allocated;
        breakdown[p.id].rem = Math.max(0, sh - allocated);
      }
    }
  });

  return breakdown;
}

function getActiveSessionFinancials(s) {
  if (!s) return { playerCollected: 0, adminAllocatedToSession: 0, collectedForSession: 0, outstanding: 0 };
  const breakdown = getSessionBreakdown(s.id);
  let playerCollected = 0;
  s.players.forEach(pid => { playerCollected += (breakdown[pid] ? breakdown[pid].paid : 0); });

  let totalAdminPaid = data.transactions.filter(t => String(t.playerId) === "admin").reduce((sum, t) => sum + t.amount, 0);
  let adminAllocatedToSession = 0;

  for (let sess of data.sessions) {
    let sessBreakdown = (sess.id === s.id) ? breakdown : getSessionBreakdown(sess.id);
    let sessPlayerCollected = 0;
    sess.players.forEach(pid => { sessPlayerCollected += (sessBreakdown[pid] ? sessBreakdown[pid].paid : 0); });
    let sessRem = Math.max(0, sess.cost - sessPlayerCollected);
    let adminCover = Math.min(totalAdminPaid, sessRem);
    totalAdminPaid -= adminCover;
    if (sess.id === s.id) {
      adminAllocatedToSession = adminCover;
    }
  }

  const collectedForSession = playerCollected + adminAllocatedToSession;
  const outstanding = Math.max(0, s.cost - collectedForSession);
  return { playerCollected, adminAllocatedToSession, collectedForSession, outstanding };
}

function showHome(){
  if(sessionStorage.getItem("manager_authenticated") === "true") {
    sessionStorage.removeItem("manager_authenticated");
  }
  document.getElementById("home").style.display="block";
  document.getElementById("admin").classList.remove("active");
  updateNav();
  window.scrollTo({top:0,behavior:"smooth"});
}

function openAdmin(){
  if(sessionStorage.getItem("manager_authenticated") === "true") {
    document.getElementById("home").style.display="none";
    document.getElementById("admin").classList.add("active");
    updateNav();
    renderAdmin();
    renderPlayers();
  } else {
    document.getElementById("pinModal").classList.add("active");
    document.getElementById("managerUsername").focus();
  }
}

function handlePlayersTabContextMenu(e) {
  if (e.ctrlKey) {
    e.preventDefault();
    openChangePasswordModal(e);
  }
}

function openChangePasswordModal(e) {
  if (e) e.preventDefault();
  if (sessionStorage.getItem("manager_authenticated") !== "true") {
    return toast("Please enter manager mode first to change password");
  }
  document.getElementById("currentManagerPin").value = "";
  document.getElementById("newManagerPin").value = "";
  document.getElementById("confirmManagerPin").value = "";
  document.getElementById("changePasswordModal").classList.add("active");
}

function closeModal(id){document.getElementById(id).classList.remove("active")}

function checkPin(){
  const usernameInput = document.getElementById("managerUsername").value.trim();
  const pinInput = document.getElementById("pin").value;
  
  if(usernameInput === "FCManager" && pinInput === (data.managerPin || "1234")){
    sessionStorage.setItem("manager_authenticated", "true");
    closeModal("pinModal");
    document.getElementById("pin").value="";
    document.getElementById("managerUsername").value="";
    document.getElementById("home").style.display="none";
    document.getElementById("admin").classList.add("active");
    updateNav();
    renderAdmin();
    renderPlayers();
  } else {
    toast("wrong username or pin");
  }
}

function changeManagerPin() {
  const currentPin = document.getElementById("currentManagerPin").value;
  const newPin = document.getElementById("newManagerPin").value;
  const confirmPin = document.getElementById("confirmManagerPin").value;

  if (currentPin !== (data.managerPin || "1234")) {
    return toast("wrong username or pin");
  }
  if (!newPin.trim()) {
    return toast("New password cannot be empty");
  }
  if (newPin !== confirmPin) {
    return toast("New passwords do not match");
  }

  data.managerPin = newPin;
  save();
  document.getElementById("currentManagerPin").value = "";
  document.getElementById("newManagerPin").value = "";
  document.getElementById("confirmManagerPin").value = "";
  closeModal("changePasswordModal");
  toast("Manager password updated successfully");
}

function clearSearch(){document.getElementById("search").value="";document.getElementById("suggestions").innerHTML="";document.getElementById("profile").classList.remove("active")}

function searchPlayers(){
 const q=document.getElementById("search").value.trim().toLowerCase(), box=document.getElementById("suggestions");
 box.innerHTML="";
 if(!q)return;
 data.players.filter(p=>p.name.toLowerCase().includes(q)).slice(0,6).forEach(p=>{
   const b=document.createElement("button");b.className="suggestion";b.textContent=p.name;b.onclick=()=>selectPlayer(p.id);box.appendChild(b)
 })
}

function selectPlayer(id){
 selectedPlayer = id;
 const p = getPlayer(id);
 document.getElementById("suggestions").innerHTML="";
 document.getElementById("search").value=p.name;
 
 const { totalPaid, balance, playerSessions } = getPlayerMetrics(id);
 const s = current();
 const sh = (s && s.players.includes(id)) ? share(s) : 0;
 
 document.getElementById("profile").classList.add("active");
 document.getElementById("profileName").textContent = p.name;
 
 const status = document.getElementById("profileStatus");
 if(balance < 0.01) {
   status.className = "status paid";
   status.textContent = balance < -0.009 ? `✓ Pre-paid / Credit (${money(Math.abs(balance))})` : "✓ Fully Paid";
   document.getElementById("profileBalanceLabel").textContent = "Current credit balance";
   document.getElementById("profileBalance").textContent = money(balance < 0 ? Math.abs(balance) : 0);
 } else {
   status.className = "status " + (totalPaid > 0 ? "partial" : "due");
   status.textContent = totalPaid > 0 ? "◐ Amount Pending" : "● Unpaid";
   document.getElementById("profileBalanceLabel").textContent = "Current amount owed";
   document.getElementById("profileBalance").textContent = money(balance);
 }

 document.getElementById("weekShare").textContent = money(sh);
 document.getElementById("totalPaid").textContent = money(totalPaid);
 document.getElementById("sessionCount").textContent = playerSessions.length;
 
 document.getElementById("history").innerHTML = data.sessions.slice().reverse().filter(x=>x.players.includes(id)).map(x=>{
   const breakdown = getSessionBreakdown(x.id)[id] || { paid:0, rem: share(x) };
   const sr = share(x);
   const isPaid = breakdown.rem < 0.01;
   return `<tr>
     <td>${x.date}</td>
     <td>${money(x.cost)}</td>
     <td>${x.players.length}</td>
     <td class="amount">${money(sr)}</td>
     <td>${money(breakdown.paid)}</td>
     <td><span class="status ${isPaid ?"paid":breakdown.paid>0?"partial":"due"}">${isPaid ?"Paid":breakdown.paid>0?"Partial":"Unpaid"}</span></td>
   </tr>`
 }).join("");
 document.getElementById("profile").scrollIntoView({behavior:"smooth",block:"start"})
}

function renderMatchResultsAndQR(){
  const s = current();
  if(s){
    document.getElementById("latestMatchDate").textContent = s.date;
    document.getElementById("redTeamScore").textContent = (s.score && s.score.red !== undefined) ? s.score.red : 0;
    document.getElementById("blueTeamScore").textContent = (s.score && s.score.blue !== undefined) ? s.score.blue : 0;
    
    const acc = s.accolades || {};
    document.getElementById("accTopScorer").textContent = getPlayerName(acc.topScorer);
    document.getElementById("accSuperior").textContent = getPlayerName(acc.superior);
    document.getElementById("accPlaymaker").textContent = getPlayerName(acc.playmaker);
    document.getElementById("accPuskas").textContent = getPlayerName(acc.puskas);
    document.getElementById("accOscar").textContent = getPlayerName(acc.oscar);
    document.getElementById("accPunctual").textContent = getPlayerName(acc.punctual);
  } else {
    document.getElementById("latestMatchDate").textContent = "No sessions played";
    document.getElementById("redTeamScore").textContent = 0;
    document.getElementById("blueTeamScore").textContent = 0;
    document.getElementById("accTopScorer").textContent = "-";
    document.getElementById("accSuperior").textContent = "-";
    document.getElementById("accPlaymaker").textContent = "-";
    document.getElementById("accPuskas").textContent = "-";
    document.getElementById("accOscar").textContent = "-";
    document.getElementById("accPunctual").textContent = "-";
  }

  const img = document.getElementById("playerQRImg");
  const placeholder = document.getElementById("qrPlaceholder");
  if(data.qrCode){
    img.src = data.qrCode;
    img.style.display = "block";
    placeholder.style.display = "none";
  } else {
    img.style.display = "none";
    placeholder.style.display = "block";
  }

  document.getElementById("displayAccNumber").textContent = data.accountNumber || "Not set";
  document.getElementById("displayAccName").textContent = data.accountName || "Not set";
  if(document.getElementById("modalAccNumber")) document.getElementById("modalAccNumber").textContent = data.accountNumber || "Not set";
  if(document.getElementById("modalAccName")) document.getElementById("modalAccName").textContent = data.accountName || "Not set";
}

function copyAccNumber() {
  const accNum = document.getElementById("displayAccNumber").textContent.trim();
  if(!accNum || accNum === "Not set") return toast("No account number set");
  
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(accNum).then(() => {
      toast("Account number copied to clipboard!");
    }).catch(() => fallbackCopy(accNum));
  } else {
    fallbackCopy(accNum);
  }
}

function copyModalAccNumber() {
  const accNum = document.getElementById("modalAccNumber").textContent.trim();
  if(!accNum || accNum === "Not set") return toast("No account number set");
  
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(accNum).then(() => {
      toast("Account number copied to clipboard!");
    }).catch(() => fallbackCopy(accNum));
  } else {
    fallbackCopy(accNum);
  }
}

function fallbackCopy(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    toast("Account number copied to clipboard!");
  } catch (err) {
    toast("Failed to copy account number");
  }
  document.body.removeChild(textArea);
}

function openQRModal() {
  const img = document.getElementById("enlargedQRImg");
  const placeholder = document.getElementById("enlargedQRPlaceholder");
  if(data.qrCode){
    img.src = data.qrCode;
    img.style.display = "block";
    placeholder.style.display = "none";
  } else {
    img.style.display = "none";
    placeholder.style.display = "block";
  }
  document.getElementById("modalAccNumber").textContent = data.accountNumber || "Not set";
  document.getElementById("modalAccName").textContent = data.accountName || "Not set";
  document.getElementById("qrEnlargeModal").classList.add("active");
}

function saveAccountDetails() {
  const num = document.getElementById("accNumInput").value.trim();
  const name = document.getElementById("accNameInput").value.trim();
  data.accountNumber = num || "7730000000000";
  data.accountName = name || "Bathootha";
  save();
  renderMatchResultsAndQR();
  toast("Account details updated");
}

function adminTab(tab,btn){
 document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));btn.classList.add("active");
 ["current","all-pending","sessions-log","accolades-log","create","players"].forEach(x=>document.getElementById("tab-"+x).style.display=x===tab?"block":"none");
 if(tab==="current")renderAdmin();
 if(tab==="all-pending")renderAllPending();
 if(tab==="sessions-log")renderSessionsLog();
 if(tab==="accolades-log")renderAccoladesLog();
 if(tab==="create")renderCreatePlayers();
 if(tab==="players")renderPlayers();
}

function renderAdmin(){
 const s = current();
 if(!s){
   document.getElementById("adminRows").innerHTML='<tr><td colspan="6" class="empty">No active session created.</td></tr>';
   document.getElementById("kpiCost").textContent = money(0);
   document.getElementById("kpiCollected").textContent = money(0);
   document.getElementById("kpiOutstanding").textContent = money(0);
   document.getElementById("currentTitle").textContent = "No active session";
   document.getElementById("currentMeta").textContent = "Create a session in the 'Create new session' tab";
   return;
 }
 const sr = share(s);
 const breakdown = getSessionBreakdown(s.id);
 const { collectedForSession, outstanding } = getActiveSessionFinancials(s);

 document.getElementById("kpiCost").textContent = money(s.cost);
 document.getElementById("kpiCollected").textContent = money(collectedForSession);
 document.getElementById("kpiOutstanding").textContent = money(outstanding);
 document.getElementById("currentTitle").textContent = s.location||"Active session";
 document.getElementById("currentMeta").textContent = `${s.date} · ${s.players.length} players · ${money(sr)} each`;
 
 document.getElementById("adminRows").innerHTML = s.players.map(id => {
   const p = getPlayer(id);
   const b = breakdown[id] || { paid:0, rem: sr };
   const isPaid = b.rem < 0.01;
   return `<tr>
     <td><b>${p.name}</b></td>
     <td>${money(sr)}</td>
     <td>${money(b.paid)}</td>
     <td class="amount">${money(b.rem)}</td>
     <td><span class="status ${isPaid ?"paid":b.paid>0?"partial":"due"}">${isPaid ?"Paid":b.paid>0?"Partial":"Unpaid"}</span></td>
     <td>
       <div class="action-cell">
         <button class="btn ghost sm" onclick="quickPay(${id})">Pay</button>
         <button class="btn ghost sm" onclick="openPlayerTxLogs(${id})">Logs</button>
       </div>
     </td>
   </tr>`
 }).join("");
}

function quickPay(id){ openPaymentModal(id); }

function openPaymentModal(targetPlayerId = null){
 if(!data.players.length) return toast("Add players first");
 
 let playerOptions = `<option value="admin">Admin (Manager Payment)</option>` + 
   data.players.map(p=>`<option value="${p.id}">${p.name}</option>`).join("");
 const sel = document.getElementById("paymentPlayer");
 sel.innerHTML = playerOptions;
 
 if(targetPlayerId) {
   sel.value = targetPlayerId;
   const { balance } = getPlayerMetrics(targetPlayerId);
   document.getElementById("paymentAmount").value = balance > 0.009 ? balance.toFixed(2) : "";
 } else {
   sel.value = data.players[0].id;
   document.getElementById("paymentAmount").value = "";
 }
 document.getElementById("paymentModal").classList.add("active");
}

function recordPayment(){
 const rawVal = document.getElementById("paymentPlayer").value;
 const id = rawVal === "admin" ? "admin" : +rawVal;
 const amount = +document.getElementById("paymentAmount").value;
 if(!amount || amount <= 0) return toast("Enter a valid payment amount");
 
 const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
 const activeSess = current();
 const sessId = activeSess ? activeSess.id : null;
 data.transactions.push({ id: Date.now(), playerId: id, sessionId: sessId, amount: Number(amount.toFixed(2)), date: now });
 save();
 closeModal("paymentModal");
 renderAdmin();
 if(document.getElementById("tab-all-pending").style.display !== "none") renderAllPending();
 toast(id === "admin" ? "Admin payment recorded" : "Payment recorded");
 if(selectedPlayer === id) selectPlayer(id);
}

function openPlayerTxLogs(playerId) {
 if(!playerId) return toast("Invalid player");
 currentModalPlayerId = playerId;
 const p = getPlayer(playerId);
 document.getElementById("txLogsTitle").textContent = `Payment Logs: ${p ? p.name : 'Unknown'}`;
 renderTxLogsRows();
 document.getElementById("txLogsModal").classList.add("active");
}

function renderTxLogsRows() {
 const logs = data.transactions.filter(t => String(t.playerId) === String(currentModalPlayerId)).sort((a,b) => b.id - a.id);
 if(!logs.length) {
   document.getElementById("txLogsRows").innerHTML = `<tr><td colspan="3" class="empty">No individual payment logs found.</td></tr>`;
   return;
 }
 document.getElementById("txLogsRows").innerHTML = logs.map(t => `
   <tr>
     <td>${t.date}</td>
     <td class="amount">${money(t.amount)}</td>
     <td><button class="btn red sm" onclick="deleteTransaction(${t.id})">Delete</button></td>
   </tr>
 `).join("");
}

function deleteTransaction(txId) {
 data.transactions = data.transactions.filter(t => t.id !== txId);
 save();
 renderTxLogsRows();
 renderAdmin();
 if(document.getElementById("tab-all-pending").style.display !== "none") renderAllPending();
 if(selectedPlayer === currentModalPlayerId) selectPlayer(currentModalPlayerId);
 toast("Transaction deleted");
}

function renderSessionsLog() {
  if(!data.sessions.length) {
    document.getElementById("sessionsLogRows").innerHTML = `<tr><td colspan="6" class="empty">No sessions created yet.</td></tr>`;
    return;
  }

  document.getElementById("sessionsLogRows").innerHTML = data.sessions.slice().reverse().map(s => {
    const playerNames = s.players.map(pid => getPlayerName(pid)).join(", ");
    return `
      <tr>
        <td><b>${s.date}</b></td>
        <td>${s.location || "-"}</td>
        <td class="amount">${money(s.cost)}</td>
        <td><b>${s.bookingPaidBy || "-"}</b></td>
        <td><span title="${playerNames}">${s.players.length} players (${playerNames})</span></td>
        <td>
          <div class="action-cell">
            <button class="btn ghost sm" onclick="openEditSessionModal(${s.id})">Edit</button>
            <button class="btn red sm" onclick="deleteSession(${s.id})">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function deleteSession(sessionId) {
  const s = data.sessions.find(x => x.id === sessionId);
  if(!s) return;
  pendingDeleteSessionId = sessionId;
  document.getElementById("deleteSessionMsg").textContent = `Are you sure you want to delete the session from ${s.date} (${s.location || 'Football field'})? All related accolades and transactions for this session will also be permanently deleted.`;
  document.getElementById("deleteSessionModal").classList.add("active");
}

function confirmDeleteSession() {
  if (!pendingDeleteSessionId) return;
  const sessionId = pendingDeleteSessionId;
  const s = data.sessions.find(x => x.id === sessionId);
  if(s) {
    data.sessions = data.sessions.filter(x => x.id !== sessionId);
    data.transactions = data.transactions.filter(t => t.sessionId !== sessionId && (!t.date || !t.date.startsWith(s.date)));
    save();
    renderSessionsLog();
    renderAdmin();
    if(document.getElementById("tab-all-pending").style.display !== "none") renderAllPending();
    if(document.getElementById("tab-accolades-log").style.display !== "none") renderAccoladesLog();
    renderMatchResultsAndQR();
    if(selectedPlayer) selectPlayer(selectedPlayer);
    toast("Session and associated data deleted");
  }
  pendingDeleteSessionId = null;
  closeModal("deleteSessionModal");
}

function openEditSessionModal(sessionId) {
  const s = data.sessions.find(x => x.id === sessionId);
  if(!s) return toast("Session not found");
  
  document.getElementById("editSessionId").value = s.id;
  document.getElementById("editSessionDate").value = s.date;
  document.getElementById("editSessionLocation").value = s.location || "";
  document.getElementById("editSessionCost").value = s.cost !== undefined ? s.cost.toFixed(2) : "0.00";
  document.getElementById("editSessionBookingPaidBy").value = s.bookingPaidBy || "";

  document.getElementById("editPlayersList").innerHTML = data.players.map(p => `
    <label class="player-row">
      <span class="check">
        <input type="checkbox" value="${p.id}" ${s.players.includes(p.id) ? "checked" : ""}>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;" title="${p.name}">${p.name}</span>
      </span>
    </label>
  `).join("");

  document.getElementById("editSessionModal").classList.add("active");
}

function selectAllEditPlayers(selectState) {
  const checkboxes = document.querySelectorAll("#editPlayersList input[type='checkbox']");
  checkboxes.forEach(cb => cb.checked = selectState);
}

function saveEditedSession() {
  const id = +document.getElementById("editSessionId").value;
  const s = data.sessions.find(x => x.id === id);
  if(!s) return;
  
  const date = document.getElementById("editSessionDate").value;
  const location = document.getElementById("editSessionLocation").value.trim();
  const costInput = document.getElementById("editSessionCost").value;
  const cost = parseFloat(costInput);
  const bookingPaidBy = document.getElementById("editSessionBookingPaidBy").value.trim();
  const ids = [...document.querySelectorAll("#editPlayersList input:checked")].map(x=>+x.value);

  if(costInput.trim() === "" || isNaN(cost) || cost < 0) return toast("Field booking cost is mandatory (can be 0)");
  if(!date || !ids.length) return toast("Enter valid date and select at least one player");

  s.date = date;
  s.location = location || "Football field";
  s.cost = Number(cost.toFixed(2));
  s.bookingPaidBy = bookingPaidBy || "-";
  s.players = ids;

  save();
  closeModal("editSessionModal");
  renderSessionsLog();
  renderAdmin();
  if(selectedPlayer) selectPlayer(selectedPlayer);
  toast("Session updated successfully");
}

function renderAccoladesLog() {
  if(!data.sessions.length) {
    document.getElementById("accoladesLogRows").innerHTML = `<tr><td colspan="9" class="empty">No session accolades recorded yet.</td></tr>`;
    return;
  }

  document.getElementById("accoladesLogRows").innerHTML = data.sessions.slice().reverse().map(s => {
    const scoreText = (s.score && s.score.red !== undefined) ? `Red ${s.score.red} - ${s.score.blue} Blue` : "N/A";
    const acc = s.accolades || {};
    return `
      <tr>
        <td><b>${s.date}</b></td>
        <td>${scoreText}</td>
        <td>${getPlayerName(acc.topScorer)}</td>
        <td>${getPlayerName(acc.superior)}</td>
        <td>${getPlayerName(acc.playmaker)}</td>
        <td>${getPlayerName(acc.puskas)}</td>
        <td>${getPlayerName(acc.oscar)}</td>
        <td>${getPlayerName(acc.punctual)}</td>
        <td><button class="btn ghost sm" onclick="openEditAccoladesModal(${s.id})">Edit Accolades</button></td>
      </tr>
    `;
  }).join("");
}

function openEditAccoladesModal(sessionId) {
  const s = data.sessions.find(x => x.id === sessionId);
  if(!s) return toast("Session not found");

  document.getElementById("editAccoladesSessionId").value = s.id;
  document.getElementById("editScoreRed").value = (s.score && s.score.red !== undefined) ? s.score.red : 0;
  document.getElementById("editScoreBlue").value = (s.score && s.score.blue !== undefined) ? s.score.blue : 0;

  const playerOpts = `<option value="">-- None --</option>` + data.players.map(p=>`<option value="${p.id}">${p.name}</option>`).join("");
  const selects = ["editAccTopScorer", "editAccSuperior", "editAccPlaymaker", "editAccPuskas", "editAccOscar", "editAccPunctual"];
  selects.forEach(id => document.getElementById(id).innerHTML = playerOpts);

  const acc = s.accolades || {};
  document.getElementById("editAccTopScorer").value = acc.topScorer || "";
  document.getElementById("editAccSuperior").value = acc.superior || "";
  document.getElementById("editAccPlaymaker").value = acc.playmaker || "";
  document.getElementById("editAccPuskas").value = acc.puskas || "";
  document.getElementById("editAccOscar").value = acc.oscar || "";
  document.getElementById("editAccPunctual").value = acc.punctual || "";

  document.getElementById("editAccoladesModal").classList.add("active");
}

function saveSessionAccolades() {
  const id = +document.getElementById("editAccoladesSessionId").value;
  const s = data.sessions.find(x => x.id === id);
  if(!s) return;

  const redScore = +document.getElementById("editScoreRed").value || 0;
  const blueScore = +document.getElementById("editScoreBlue").value || 0;

  s.score = { red: redScore, blue: blueScore };
  s.accolades = {
    topScorer: +document.getElementById("editAccTopScorer").value || null,
    superior: +document.getElementById("editAccSuperior").value || null,
    playmaker: +document.getElementById("editAccPlaymaker").value || null,
    puskas: +document.getElementById("editAccPuskas").value || null,
    oscar: +document.getElementById("editAccOscar").value || null,
    punctual: +document.getElementById("editAccPunctual").value || null
  };

  save();
  closeModal("editAccoladesModal");
  renderAccoladesLog();
  renderMatchResultsAndQR();
  toast("Accolades updated successfully");
}

function openDeleteAllModal() {
 document.getElementById("deleteAllPin").value = "";
 document.getElementById("deleteAllModal").classList.add("active");
}

function confirmDeleteAllTransactions() {
 const pin = document.getElementById("deleteAllPin").value;
 if(pin !== (data.managerPin || "1234")) return toast("wrong username or pin");
 data.transactions = [];
 data.sessions = [];
 save();
 closeModal("deleteAllModal");
 renderAdmin();
 renderPlayers();
 renderMatchResultsAndQR();
 if(selectedPlayer) selectPlayer(selectedPlayer);
 toast("All sessions and payment records cleared");
}

function exportCSV() {
 if (!data.transactions || !data.transactions.length) {
   return toast("No transaction history available to export.");
 }
 let csvRows = ["Transaction ID,Date & Time,Payer Name,Amount Paid (MVR)"];
 data.transactions.forEach(t => {
   const playerName = getPlayerName(t.playerId).replace(/"/g, '""');
   csvRows.push(`"${t.id}","${t.date}","${playerName}",${t.amount.toFixed(2)}`);
 });
 
 downloadCSV(csvRows.join("\n"), "friday_fc_transactions_v0.791.050926.csv");
}

function exportSessionsCSV() {
 if (!data.sessions || !data.sessions.length) {
   return toast("No sessions available to export.");
 }
 let csvRows = ["Session ID,Date,Venue,Total Cost (MVR),Booking Paid By,Player Count,Share Per Player (MVR),Attending Players"];
 data.sessions.forEach(s => {
   const playerNames = s.players.map(pid => getPlayerName(pid)).join("; ");
   const costPerPlayer = share(s);
   csvRows.push([
     `"${s.id}"`,
     `"${s.date}"`,
     `"${(s.location || "").replace(/"/g, '""')}"`,
     s.cost.toFixed(2),
     `"${(s.bookingPaidBy || "-").replace(/"/g, '""')}"`,
     s.players.length,
     costPerPlayer.toFixed(2),
     `"${playerNames.replace(/"/g, '""')}"`
   ].join(","));
 });

 downloadCSV(csvRows.join("\n"), "friday_fc_sessions_log_v0.791.050926.csv");
}

function exportAccoladesCSV() {
 if (!data.sessions || !data.sessions.length) {
   return toast("No session accolades available to export.");
 }
 let csvRows = ["Session Date,Match Score,Top Scorer,Superior Player,Best Playmaker,Puskas Award,Oscar Award,Most Punctual"];
 data.sessions.forEach(s => {
   const scoreText = (s.score && s.score.red !== undefined) ? `Red ${s.score.red} - ${s.score.blue} Blue` : "N/A";
   const acc = s.accolades || {};
   csvRows.push([
     `"${s.date}"`,
     `"${scoreText}"`,
     `"${getPlayerName(acc.topScorer)}"`,
     `"${getPlayerName(acc.superior)}"`,
     `"${getPlayerName(acc.playmaker)}"`,
     `"${getPlayerName(acc.puskas)}"`,
     `"${getPlayerName(acc.oscar)}"`,
     `"${getPlayerName(acc.punctual)}"`
   ].join(","));
 });
 
 downloadCSV(csvRows.join("\n"), "friday_fc_accolades_log_v0.791.050926.csv");
}

function downloadCSV(csvContent, filename) {
 const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
 const link = document.createElement("a");
 const url = URL.createObjectURL(blob);
 link.setAttribute("href", url);
 link.setAttribute("download", filename);
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 toast("CSV exported successfully");
}

function sortAllPending(col) {
  if (allPendingSortCol === col) {
    allPendingSortDir = (allPendingSortDir === 'asc') ? 'desc' : 'asc';
  } else {
    allPendingSortCol = col;
    allPendingSortDir = (col === 'name' || col === 'status') ? 'asc' : 'desc';
  }
  renderAllPending();
}

function renderAllPending(){
 let totalAllCost = data.sessions.reduce((sum, s) => sum + s.cost, 0);
 let totalAllCollected = data.transactions.reduce((sum, t) => sum + t.amount, 0);
 let totalAllPending = Math.max(0, totalAllCost - totalAllCollected);

 document.getElementById("kpiAllCost").textContent = money(totalAllCost);
 document.getElementById("kpiAllCollected").textContent = money(totalAllCollected);
 document.getElementById("kpiAllPending").textContent = money(totalAllPending);

 let list = [];

 const adminPaid = data.transactions.filter(t => String(t.playerId) === "admin").reduce((sum, t) => sum + t.amount, 0);
 if (adminPaid > 0) {
   list.push({
     id: "admin",
     name: "Admin",
     isAdmin: true,
     sessions: 0,
     cost: 0,
     paid: adminPaid,
     balance: -adminPaid,
     status: "Admin Paid"
   });
 }

 data.players.forEach(p => {
   const { totalPaid, totalCostShare, balance, playerSessions } = getPlayerMetrics(p.id);
   const isPaid = balance < 0.01;
   const statusText = isPaid ? "Clear" : (totalPaid > 0 ? "Pending" : "Unpaid");
   list.push({
     id: p.id,
     name: p.name,
     isAdmin: false,
     sessions: playerSessions.length,
     cost: totalCostShare,
     paid: totalPaid,
     balance: balance,
     status: statusText
   });
 });

 list.sort((a, b) => {
   let valA = a[allPendingSortCol];
   let valB = b[allPendingSortCol];

   if (typeof valA === 'string') {
     let res = valA.localeCompare(valB);
     return allPendingSortDir === 'asc' ? res : -res;
   } else {
     let res = valA - valB;
     return allPendingSortDir === 'asc' ? res : -res;
   }
 });

 const getSortIcon = (col) => {
   if (allPendingSortCol !== col) return ' <span style="opacity:0.3;font-size:10px;">↕</span>';
   return allPendingSortDir === 'asc' ? ' <span style="font-size:10px;">▲</span>' : ' <span style="font-size:10px;">▼</span>';
 };

 const tableHeaderHTML = `
   <tr>
     <th onclick="sortAllPending('name')" style="cursor:pointer;user-select:none;">Player${getSortIcon('name')}</th>
     <th onclick="sortAllPending('sessions')" style="cursor:pointer;user-select:none;">Sessions Joined${getSortIcon('sessions')}</th>
     <th onclick="sortAllPending('cost')" style="cursor:pointer;user-select:none;">Total Cost Share${getSortIcon('cost')}</th>
     <th onclick="sortAllPending('paid')" style="cursor:pointer;user-select:none;">Total Paid${getSortIcon('paid')}</th>
     <th onclick="sortAllPending('balance')" style="cursor:pointer;user-select:none;">Balance / Credit${getSortIcon('balance')}</th>
     <th onclick="sortAllPending('status')" style="cursor:pointer;user-select:none;">Status${getSortIcon('status')}</th>
     <th>Actions</th>
   </tr>
 `;

 document.getElementById("allPendingHeader").innerHTML = tableHeaderHTML;

 let rowsHTML = list.map(item => {
   if (item.isAdmin) {
     return `<tr style="background:#F0F4FF;">
       <td><b>Admin</b> <span class="status paid" style="font-size:10px;padding:2px 6px;margin-left:4px;">Manager</span></td>
       <td>-</td>
       <td>MVR 0.00</td>
       <td>${money(item.paid)}</td>
       <td class="amount" style="color:var(--green)">${money(item.paid)} Covered</td>
       <td><span class="status paid">✓ Admin Paid</span></td>
       <td><button class="btn ghost sm" onclick="openPlayerTxLogs('admin')">Logs</button></td>
     </tr>`;
   }

   const isPaid = item.balance < 0.01;
   const displayBalance = isPaid ? (item.balance < -0.009 ? money(Math.abs(item.balance)) + " Credit" : "MVR 0.00") : money(item.balance);
   const statusClass = isPaid ? "paid" : (item.paid > 0 ? "partial" : "due");
   const statusLabel = isPaid ? "✓ Clear" : (item.paid > 0 ? "◐ Pending" : "● Unpaid");

   return `<tr>
     <td><b>${item.name}</b></td>
     <td>${item.sessions}</td>
     <td>${money(item.cost)}</td>
     <td>${money(item.paid)}</td>
     <td class="amount" style="color:${isPaid ? 'var(--green)' : 'var(--red)'}">
       ${displayBalance}
     </td>
     <td><span class="status ${statusClass}">${statusLabel}</span></td>
     <td><button class="btn ghost sm" onclick="openPlayerTxLogs(${item.id})">Logs</button></td>
   </tr>`;
 }).join("");

 document.getElementById("allPendingRows").innerHTML = rowsHTML;
}

function renderCreatePlayers(){
 document.getElementById("sessionDate").value = new Date().toISOString().split('T')[0];
 document.getElementById("createPlayers").innerHTML=data.players.map(p=>`
   <label class="player-row">
     <span class="check">
       <input type="checkbox" value="${p.id}" checked>
       <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;" title="${p.name}">${p.name}</span>
     </span>
   </label>
 `).join("");

 const playerOpts = `<option value="">-- None --</option>` + data.players.map(p=>`<option value="${p.id}">${p.name}</option>`).join("");
 document.getElementById("accSelectTopScorer").innerHTML = playerOpts;
 document.getElementById("accSelectSuperior").innerHTML = playerOpts;
 document.getElementById("accSelectPlaymaker").innerHTML = playerOpts;
 document.getElementById("accSelectPuskas").innerHTML = playerOpts;
 document.getElementById("accSelectOscar").innerHTML = playerOpts;
 document.getElementById("accSelectPunctual").innerHTML = playerOpts;
}

function selectAllPlayers(selectState){
 const checkboxes = document.querySelectorAll("#createPlayers input[type='checkbox']");
 checkboxes.forEach(cb => cb.checked = selectState);
}

function createSession(){
 const costInput = document.getElementById("sessionCost").value;
 const cost = parseFloat(costInput),
       date = document.getElementById("sessionDate").value,
       location = document.getElementById("sessionLocation").value.trim(),
       bookingPaidBy = document.getElementById("sessionBookingPaidBy").value.trim();
 const ids = [...document.querySelectorAll("#createPlayers input:checked")].map(x=>+x.value);

 if(costInput.trim() === "" || isNaN(cost) || cost < 0) return toast("Field booking cost is mandatory (can be 0)");
 if(!date || !ids.length) return toast("Enter session date and select at least one player");

 const redScore = +document.getElementById("scoreRed").value || 0;
 const blueScore = +document.getElementById("scoreBlue").value || 0;

 const accolades = {
   topScorer: +document.getElementById("accSelectTopScorer").value || null,
   superior: +document.getElementById("accSelectSuperior").value || null,
   playmaker: +document.getElementById("accSelectPlaymaker").value || null,
   puskas: +document.getElementById("accSelectPuskas").value || null,
   oscar: +document.getElementById("accSelectOscar").value || null,
   punctual: +document.getElementById("accSelectPunctual").value || null
 };

 data.sessions.push({
   id: Date.now(),
   date,
   location: location || "Football field",
   cost: Number(cost.toFixed(2)),
   bookingPaidBy: bookingPaidBy || "-",
   players: ids,
   score: { red: redScore, blue: blueScore },
   accolades: accolades
 });

 save();
 renderAdmin();
 renderMatchResultsAndQR();
 adminTab("current",document.querySelector(".tab"));
 toast("New weekly session created");
 if(selectedPlayer) selectPlayer(selectedPlayer);
}

function addPlayer(){
 const name=document.getElementById("newPlayer").value.trim();if(!name)return;
 data.players.push({id:Date.now(),name});save();document.getElementById("newPlayer").value="";renderPlayers();toast("Player added")
}

function renderPlayers(){
 document.getElementById("accNameInput").value = data.accountName || "";
 document.getElementById("accNumInput").value = data.accountNumber || "";
 document.getElementById("allPlayers").innerHTML=data.players.map(p=>`
   <div class="player-row">
     <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;" title="${p.name}">${p.name}</b>
     <button class="btn red sm" onclick="removePlayer(${p.id})">Remove</button>
   </div>
 `).join("")
}

function removePlayer(id){
 if(data.sessions.some(s=>s.players.includes(id)))return toast("Player is in session history; keep them for accurate records.");
 data.players=data.players.filter(p=>p.id!==id);
 save();
 renderPlayers();
 toast("Player removed")
}

function handleQRUpload(event) {
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    data.qrCode = e.target.result;
    save();
    renderMatchResultsAndQR();
    toast("Payment QR code updated");
  };
  reader.readAsDataURL(file);
}

function removeQR() {
  data.qrCode = null;
  save();
  renderMatchResultsAndQR();
  document.getElementById("qrFileInput").value = "";
  toast("QR Code removed");
}

function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)}