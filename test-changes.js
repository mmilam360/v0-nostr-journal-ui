// Test file to verify changes are present
console.log("=== TESTING LIGHTNING GOALS CHANGES ===");

// Test 1: Check if the new cancel button text is present
const testCancelButton = () => {
  const button = document.querySelector('button:contains("Cancel Stake & Forfeit")');
  if (button) {
    console.log("✅ Cancel button text updated to 'Cancel Stake & Forfeit'");
  } else {
    console.log("❌ Cancel button text not found or not updated");
  }
};

// Test 2: Check if Lightning address field is visible in profile
const testLightningAddressField = () => {
  const field = document.querySelector('input[placeholder*="lightning.address"]');
  if (field) {
    console.log("✅ Lightning address field found in profile");
  } else {
    console.log("❌ Lightning address field not found");
  }
};

// Test 3: Check if yellow debug styling is present
const testDebugStyling = () => {
  const debugElement = document.querySelector('.bg-yellow-100');
  if (debugElement) {
    console.log("✅ Yellow debug styling found");
  } else {
    console.log("❌ Yellow debug styling not found");
  }
};

// Run tests
console.log("Running tests...");
testCancelButton();
testLightningAddressField();
testDebugStyling();

console.log("=== END TEST ===");
