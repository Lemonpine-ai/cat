export type ProjectCreationFormState = {
  projectDisplayName: string;
  objectClassNameText: string;
  datasetGoalDescription: string;
  sourceVideoDescription: string;
};

export type ProjectCreationPreview = {
  projectDisplayName: string;
  objectClassNameList: string[];
  datasetGoalDescription: string;
  sourceVideoDescription: string;
  recommendedNextStepList: string[];
};
