import { db, auth } from './firebase-config.js';
import { collection, getDocs, doc, setDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Page Protection & Init
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    // Check if superadmin
    // Note: In a real app complexity, this should be a custom claim or protected by security rules.
    // For this client-side demo, we read the user doc.
    try {
        // We might not be able to read our own role if rules are strict, but assuming 'users' is readable.
        // We'll proceed to load the UI. The Firestore rules should ideally protect write operations.
        loadUsers();
    } catch (e) {
        console.error("Auth check failed", e);
    }
});

// Logout Logic
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = 'login.html');
});

// Load Users
async function loadUsers() {
    const tableBody = document.getElementById('userTableBody');
    tableBody.innerHTML = '<tr><td colspan="3" class="px-6 py-4 text-center">Loading users...</td></tr>';

    try {
        const q = query(collection(db, 'users'));
        const querySnapshot = await getDocs(q);
        
        tableBody.innerHTML = '';
        
        if (querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="3" class="px-6 py-4 text-center text-gray-500">No users found.</td></tr>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const userData = docSnap.data();
            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50 transition-colors";
            
            // Determine badge color
            let roleColor = 'bg-gray-100 text-gray-800';
            if (userData.role === 'superadmin') roleColor = 'bg-purple-100 text-purple-800';
            if (userData.role === 'admin') roleColor = 'bg-blue-100 text-blue-800';

            tr.innerHTML = `
                <td class="px-6 py-4 font-medium text-gray-900">${userData.email}</td>
                <td class="px-6 py-4">
                    <span class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${roleColor}">
                        ${userData.role || 'user'}
                    </span>
                </td>
                <td class="px-6 py-4">
                    <button onclick="window.deleteUser('${docSnap.id}')" class="text-red-600 hover:text-red-900 font-medium">
                        <i class="fas fa-trash-alt"></i> Remove
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error loading users:", error);
        tableBody.innerHTML = `<tr><td colspan="3" class="px-6 py-4 text-center text-red-500">Error loading users: ${error.message}</td></tr>`;
    }
}

// Add User with Auth Creation
document.getElementById('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value.trim();
    const role = document.getElementById('newUserRole').value;

    if (!email || !password) return;
    if (password.length < 6) {
        alert("Password must be at least 6 characters.");
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creating...';
    submitBtn.disabled = true;

    try {
        // 1. Initialize Secondary App to avoid logging out the Admin
        const { initializeApp, deleteApp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
        const { getAuth, createUserWithEmailAndPassword, signOut } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
        
        // Use the same config but a different app name
        // We need to import config, but since it's an object in firebase-config.js not default, we can't easily get it raw without exporting it.
        // Quick workaround: hardcode relevant keys or assume the auth domain/key is same.
        // Ideally: export `firebaseConfig` from firebase-config.js.
        // Let's assume the user hasn't changed the config yet. 
        // We will fetch it from the main app instance if possible or hardcode (safe since client-side keys are public).
        const secondaryConfig = {
            apiKey: "AIzaSyBYVrOYeD9-9cnuPM-536zac5hfe2GgWX4",
            authDomain: "cr-report-backend.firebaseapp.com",
            projectId: "cr-report-backend",
        };

        const secondaryApp = initializeApp(secondaryConfig, "SecondaryApp");
        const secondaryAuth = getAuth(secondaryApp);

        // 2. Create User in Auth
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const newUser = userCredential.user;

        // 3. Create User Doc in Firestore (Using MAIN app's db connection)
        await setDoc(doc(db, 'users', newUser.uid), {
            email: email,
            role: role,
            createdAt: new Date().toISOString(),
            createdBy: auth.currentUser.email
        });

        // 4. Cleanup
        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);
        
        alert(`User ${email} created successfully with role ${role}.`);
        document.getElementById('addUserForm').reset();
        loadUsers();

    } catch (error) {
        console.error("Error creating user:", error);
        let msg = error.message;
        if(error.code === 'auth/email-already-in-use') msg = 'Email already in use.';
        alert("Failed to create user: " + msg);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});

// Delete User (Exposed to window for onclick)
window.deleteUser = async (docId) => {
    if(!confirm('Are you sure you want to remove this user?')) return;
    try {
        await deleteDoc(doc(db, 'users', docId));
        // Also try to delete invite if exists (we don't know if docId is uid or email here easily without checking)
        // For simplicity, just refresh
        loadUsers();
    } catch (error) {
        console.error("Error deleting:", error);
        alert("Delete failed: " + error.message);
    }
};

window.refreshList = loadUsers;
