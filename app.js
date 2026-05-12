async function loadFeedbackModel() {
    const response = await fetch("./data/feedback.json", { cache: "no-store" });

    if (!response.ok) {
        throw new Error(`Failed to load feedback model: ${response.status}`);
    }

    return response.json();
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function renderPrinciples(principles) {
    const root = document.getElementById("principles");
    root.innerHTML = "";

    principles.forEach((principle) => {
        const item = document.createElement("li");
        item.textContent = principle;
        root.appendChild(item);
    });
}

function renderStates(states) {
    const root = document.getElementById("states");
    root.innerHTML = "";

    states.forEach((state) => {
        const card = document.createElement("article");
        card.className = "state-card";
        card.innerHTML = `
            <h3>${state.label}</h3>
            <p>${state.description}</p>
        `;
        root.appendChild(card);
    });
}

function renderPolicy(policy) {
    setText("policy-title", policy.title);
    setText("policy-summary", policy.summary);
    setText("policy-rule", policy.eligibilityRule);

    const requiredRoot = document.getElementById("policy-required");
    requiredRoot.innerHTML = "";

    (policy.requiredParts || []).forEach((part) => {
        const item = document.createElement("li");
        item.textContent = part;
        requiredRoot.appendChild(item);
    });

    const exampleRoot = document.getElementById("policy-examples");
    exampleRoot.innerHTML = "";

    (policy.examples || []).forEach((example) => {
        const item = document.createElement("li");
        item.textContent = example;
        exampleRoot.appendChild(item);
    });

    const excludedRoot = document.getElementById("policy-not-collected");
    excludedRoot.innerHTML = "";

    (policy.notCollected || []).forEach((part) => {
        const item = document.createElement("li");
        item.textContent = part;
        excludedRoot.appendChild(item);
    });
}

function renderSample(item) {
    setText("sample-id", item.id);
    setText("sample-source", item.source);
    setText("sample-updated", new Date(item.updatedAt).toLocaleString());
    setText("sample-report", item.report);
    setText("sample-why", item.whyItMatters);
    setText("sample-decision", item.humanDecision);

    const status = document.getElementById("sample-status");
    status.textContent = item.status;
    status.className = "status-chip status-" + item.status;

    const heroStatus = document.getElementById("hero-status");
    heroStatus.textContent = item.status;
    heroStatus.className = "status-chip status-" + item.status;

    setText("hero-updated", `Updated ${new Date(item.updatedAt).toLocaleString()}`);
    setText("hero-report", item.report);
}

async function init() {
    try {
        const model = await loadFeedbackModel();

        setText("title", model.title);
        setText("summary", model.summary);
        setText("feedback-ask", model.feedbackAsk);
        setText("hero-gate", model.reviewGate);
        setText("problem", model.problem);
        setText("hero-state-count", String((model.triageStates || []).length));
        setText("hero-principle-count", String((model.principles || []).length));

        renderPolicy(model.optInPolicy || {});
        renderPrinciples(model.principles || []);
        renderStates(model.triageStates || []);
        renderSample(model.sampleItem || {});
    } catch (error) {
        setText("title", "Feedback prototype unavailable");
        setText("summary", "The canonical data file could not be loaded for this public view.");
        setText("feedback-ask", "Useful feedback should name the signal that looks wrong or genuinely held.");
        setText("hero-gate", "No public direction should change until a human records a review decision.");
        setText("problem", error.message);
        setText("policy-title", "How To Send Feedback");
        setText("policy-summary", "Use @Tiinex with a clear feedback marker when you want review.");
        setText("policy-rule", "General chat is not treated as feedback by default.");
        setText("hero-updated", "Update time unavailable.");
        setText("hero-report", "Current report unavailable.");

        const status = document.getElementById("sample-status");
        status.textContent = "unavailable";
        status.className = "status-chip status-captured";

        const heroStatus = document.getElementById("hero-status");
        heroStatus.textContent = "unavailable";
        heroStatus.className = "status-chip status-captured";
    }
}

init();