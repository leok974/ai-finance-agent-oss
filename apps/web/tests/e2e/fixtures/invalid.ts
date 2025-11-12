// Invalid file fixture for upload validation testing
// This TypeScript file should be rejected by CSV upload validation

export const testData = {
  message: "This is not a CSV file",
  shouldBeRejected: true,
};

console.log("Invalid file type for CSV upload");
