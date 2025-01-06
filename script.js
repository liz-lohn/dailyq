console.log("Script is loaded!");

// Firebase configuration
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

// Check if the configuration is properly loaded
if (!firebaseConfig.apiKey) {
    console.error("Firebase configuration is missing. Please set environment variables.");
    throw new Error("Missing Firebase configuration.");
}

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
console.log("Firebase initialized:", firebase);

// Set persistence to LOCAL to persist user sessions
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
        console.log("Auth persistence set to LOCAL.");
    })
    .catch((error) => {
        console.error("Error setting auth persistence:", error);
    });

// Handle authentication state changes
auth.onAuthStateChanged((user) => {
    const authSection = document.getElementById("authSection");
    const userInfo = document.getElementById("userInfo");
    const userEmailSpan = document.getElementById("userEmail");
    const appTitle = document.getElementById("appTitle");

    // Elements to toggle based on login state
    const container = document.querySelector(".container");
    const latestUnansweredContainer = document.getElementById("latestUnansweredContainer");
    const answerForm = document.getElementById("answerForm");
    const latestAnswerSection = document.getElementById("latestAnswerSection");
    const answersTable = document.getElementById("answersTable");

    if (user) {
        // User is logged in
        console.log("User is logged in:", user.email);
        authSection.style.display = "none"; // Hide login/signup form
        userInfo.style.display = "block";  // Show user info
        appTitle.style.display = "block"; // Show the title
        userEmailSpan.textContent = user.email; // Display user's email

        // Show app sections
        container.style.display = "block";
        latestUnansweredContainer.style.display = "block";
        answerForm.style.display = "block";
        latestAnswerSection.style.display = "block";
        answersTable.style.display = "table";

        initPage(); // Initialize the app for the logged-in user
    } else {
        // User is logged out
        console.log("User is logged out.");
        authSection.style.display = "block"; // Show login/signup form
        userInfo.style.display = "none";    // Hide user info
        appTitle.style.display = "none"; // Show the title

        // Hide app sections
        container.style.display = "none";
        latestUnansweredContainer.style.display = "none";
        answerForm.style.display = "none";
        latestAnswerSection.style.display = "none";
        answersTable.style.display = "none";
    }
});

const getCurrentUserId = () => {
    const user = firebase.auth().currentUser;
    return user ? user.uid : null;
};
console.log(getCurrentUserId());

let latestUnansweredId = null; // Declare globally with an initial value

// Initialize the page when DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    console.log("Script is running!");
    initPage();
});

const initPage = () => {
    const form = document.getElementById("answerForm");
    const userAnswerInput = document.getElementById("userAnswer");
    const answersTableBody = document.querySelector("#answersTable tbody");
    const latestUnansweredSection = document.getElementById("latestUnanswered");
    const latestAnswerSection = document.getElementById("latestAnswerSection");
    const generateNewButton = document.getElementById("generateNewButton");

    // Remove any existing listeners before attaching new ones
    generateNewButton.replaceWith(generateNewButton.cloneNode(true));
    const newGenerateNewButton = document.getElementById("generateNewButton");
    newGenerateNewButton.addEventListener("click", () =>
        handleGenerateNew(latestUnansweredSection, answersTableBody)
    );

    // Add form submission handler
    form.addEventListener("submit", (e) => handleFormSubmit(
        e,
        userAnswerInput,
        latestUnansweredSection,
        latestAnswerSection,
        answersTableBody
    ));

    // Add "Generate New" button click handler
    generateNewButton.addEventListener("click", () => 
        handleGenerateNew(latestUnansweredSection, answersTableBody)
    );

    // Initial fetch calls
    fetchLatestUnanswered(latestUnansweredSection);
    fetchAnswers(answersTableBody);
    fetchLatestAnswer(latestAnswerSection);
};

const fetchLatestUnanswered = async (latestUnansweredSection) => {
    console.log("fetchLatestUnanswered is running...");
    try {
        const userId = getCurrentUserId();
        if (!userId) {
            console.error("User not authenticated.");
            latestUnansweredId = null; // Reset to null if no user is logged in
            latestUnansweredSection.textContent = "No unanswered questions available.";
            return;
        }

        const response = await fetch("/latest-unanswered", {
            headers: { "User-ID": userId }
        });
        console.log("Response status:", response.status);

        if (!response.ok) throw new Error("Failed to fetch the latest unanswered question");

        const latestUnanswered = await response.json();
        console.log("Response JSON:", latestUnanswered);

        if (latestUnanswered && latestUnanswered.question) {
            latestUnansweredId = latestUnanswered.id; // Update the global variable
            latestUnansweredSection.textContent = latestUnanswered.question;
            console.log("Latest unanswered ID updated:", latestUnansweredId);
        } else {
            latestUnansweredId = null; // Reset if no unanswered question is found
            latestUnansweredSection.textContent = "No unanswered questions available.";
        }
    } catch (error) {
        console.error("Error in fetchLatestUnanswered:", error.message, error.stack);
        latestUnansweredId = null; // Reset to null in case of error
        latestUnansweredSection.textContent = "Failed to fetch unanswered questions.";
    }
};
console.log(latestUnansweredId);

const fetchLatestAnswer = async (latestAnswerSection) => {
    console.log("Fetching latest answered question...");
    const userId = getCurrentUserId();
    console.log("Current User ID:", userId); // Debug log

    if (!userId) {
        console.error("User not authenticated.");
        return;
    }

    try {
        const response = await fetch("/latest-answer", {
            headers: { "User-ID": userId }
        });
        console.log("Response status:", response.status); // Debug log

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Failed to fetch the latest answer. Response:", errorText);
            throw new Error("Failed to fetch the latest answer");
        }

        const latestAnswer = await response.json();
        console.log("Latest Answer JSON:", latestAnswer); // Debug log

        const latestQuestionElement = document.getElementById("latestQuestion");
        const latestLlmAnswerElement = document.getElementById("latestLlmAnswer");
        const latestUserAnswerElement = document.getElementById("latestUserAnswer");

        if (latestAnswer.question && latestAnswer.user_answer) {
            latestQuestionElement.textContent = latestAnswer.question || "No question available";
            latestLlmAnswerElement.textContent = latestAnswer.llm_answer || "No AI guess available";
            latestUserAnswerElement.textContent = latestAnswer.user_answer || "No user answer available";
        } else {
            latestQuestionElement.textContent = "No question yet";
            latestLlmAnswerElement.textContent = "No answer yet";
            latestUserAnswerElement.textContent = "No answer yet";
        }
    } catch (error) {
        console.error("Error in fetchLatestAnswer:", error);
    }
};

const fetchAnswers = async (answersTableBody) => {
    console.log("Fetching answers...");
    const userId = getCurrentUserId();
    if (!userId) {
        console.error("User not authenticated");
        return;
    }

    try {
        const response = await fetch("/answers", {
            headers: { "User-ID": userId }
        });

        if (!response.ok) throw new Error("Failed to fetch answers");

        const answers = await response.json();
        answersTableBody.innerHTML = ""; // Clear the table body

        answers.forEach(answer => {
            if (!answer.latest) { // Exclude the latest answer
                const formattedDate = new Date(answer.date_question_created).toLocaleString();
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${formattedDate}</td>
                    <td>${answer.question || "Undefined"}</td>
                    <td>${answer.llm_answer || "Undefined"}</td>
                    <td>${answer.user_answer || "No Answer"}</td>
                `;
                answersTableBody.appendChild(row);
            }
        });
    } catch (error) {
        console.error("Error fetching answers:", error);
    }
};

const handleFormSubmit = async (e, userAnswerInput, latestUnansweredSection, latestAnswerSection, answersTableBody) => {
    e.preventDefault();

    const userAnswer = userAnswerInput.value.trim();
    if (!userAnswer) {
        alert("Answer cannot be empty.");
        return;
    }

    if (!latestUnansweredId) {
        alert("No unanswered question to associate with this answer.");
        return;
    }

    try {
        const userId = getCurrentUserId();
        if (!userId) {
            alert("User is not authenticated.");
            return;
        }

        const response = await fetch("/add-answer", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-ID": userId
            },
            body: JSON.stringify({ id: latestUnansweredId, user_answer: userAnswer })
        });

        if (!response.ok) throw new Error("Failed to add answer");

        userAnswerInput.value = ""; // Clear the input field

        // Refresh sections
        await fetchLatestUnanswered(latestUnansweredSection); // Update latest unanswered question
        await fetchLatestAnswer(latestAnswerSection); // Update latest answered question
        await fetchAnswers(answersTableBody); // Refresh the table of submitted answers
    } catch (error) {
        console.error("Error submitting answer:", error);
    }
};

let isGeneratingNew = false;

const handleGenerateNew = async (latestUnansweredSection, answersTableBody) => {
    if (isGeneratingNew) {
        console.log("Already generating a new question. Please wait...");
        return;
    }

    isGeneratingNew = true;
    latestUnansweredSection.textContent = "New question being generated...";
    const userId = getCurrentUserId();
    if (!userId) {
        alert("User is not authenticated.");
        isGeneratingNew = false;
        return;
    }

    try {
        const response = await fetch("/generate-new", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-ID": userId
            }
        });

        if (!response.ok) throw new Error("Failed to generate a new question");

        const data = await response.json();
        console.log("Generated New Question:", data);

        // Update the latest unanswered section
        latestUnansweredSection.textContent = data.question;
        latestUnansweredId = data.id; // Ensure the ID is stored here
        console.log("Latest Unanswered ID:", latestUnansweredId);

        // Refresh the answers table
        await fetchAnswers(answersTableBody);
    } catch (error) {
        console.error("Error generating new question:", error);
    } finally {
        isGeneratingNew = false;
    }
};

document.getElementById("loginButton").addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    try {
        await auth.signInWithEmailAndPassword(email, password);
        console.log("User logged in:", auth.currentUser);
        document.getElementById("authSection").style.display = "none";
        initPage(); // Initialize the app for the logged-in user
    } catch (error) {
        console.error("Login failed:", error);
        alert("Login failed: " + error.message);
    }
});

document.getElementById("signupButton").addEventListener("click", async () => {
    const email = document.getElementById("signupEmail").value;
    const password = document.getElementById("signupPassword").value;

    try {
        await auth.createUserWithEmailAndPassword(email, password);
        console.log("User signed up:", auth.currentUser);
        document.getElementById("authSection").style.display = "none";
        initPage(); // Initialize the app for the logged-in user
    } catch (error) {
        console.error("Signup failed:", error);
        alert("Signup failed: " + error.message);
    }
});

document.getElementById("resetPassword").addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value;
    if (!email) {
        alert("Please enter your email to reset the password.");
        return;
    }

    try {
        await auth.sendPasswordResetEmail(email);
        alert("Password reset email sent!");
    } catch (error) {
        console.error("Password reset failed:", error);
        alert("Password reset failed: " + error.message);
    }
});

// Handle logout button click
document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
        await auth.signOut();
        document.getElementById("authSection").style.display = "block"; // Show login/signup form
        document.getElementById("userInfo").style.display = "none";    // Hide user info
    } catch (error) {
        console.error("Error logging out:", error);
    }
});

document.getElementById("showSignup").addEventListener("click", () => {
    document.getElementById("loginForm").style.display = "none";
    document.getElementById("signupForm").style.display = "block";
});

document.getElementById("showLogin").addEventListener("click", () => {
    document.getElementById("signupForm").style.display = "none";
    document.getElementById("loginForm").style.display = "block";
});
