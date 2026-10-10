// Who may pick the tutorial server (owner: Nyssary; everyone in the PTR, which has one test account).
export const TUTORIAL_USERS = ["nyssary"];
export const canTutorial = (username, ptr) => !!ptr || TUTORIAL_USERS.includes(String(username || "").toLowerCase());
