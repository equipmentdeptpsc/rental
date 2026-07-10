import {
    Check,
  } from "lucide-react";
  
  import {
    ImportWizardStep,
    type WizardStepDefinition,
  } from "./wizardTypes";
  
  interface Props {
  
    currentStep: ImportWizardStep;
  
    steps: WizardStepDefinition[];
  
  }
  
  export default function ImportWizardStepper({
  
    currentStep,
  
    steps,
  
  }: Props) {
  
    return (
  
      <div className="w-full">
  
        <div className="flex items-start justify-between">
  
          {steps.map((step, index) => {
  
            const completed =
              step.step < currentStep;
  
            const active =
              step.step === currentStep;
  
              
            return (
  
              <div
                key={index}
                className="flex flex-1 items-center"
              >
  
                <div className="flex flex-col items-center">
  
                  <div
  
                    className={`
                      flex
                      h-10
                      w-10
                      items-center
                      justify-center
                      rounded-full
                      border-2
                      transition-all
  
                      ${
                        completed
                          ? "border-green-600 bg-green-600 text-white"
                          : active
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 bg-white text-slate-400"
                      }
                    `}
  
                  >
  
                    {completed ? (
  
                      <Check size={18} />
  
                    ) : (
  
                      <span className="text-sm font-semibold">
  
                        {index + 1}
  
                      </span>
  
                    )}
  
                  </div>
  
                  <div className="mt-3 text-center">
  
                    <div
  
                      className={`
                        text-sm
                        font-semibold
  
                        ${
                          active
                            ? "text-blue-700"
                            : completed
                            ? "text-green-700"
                            : "text-slate-500"
                        }
                      `}
  
                    >
  
                      {step.title}
  
                    </div>
  
                    <div className="mt-1 text-xs text-slate-500">
  
                      {step.description}
  
                    </div>
  
                  </div>
  
                </div>
  
                {index < steps.length - 1 && (
  
                  <div
  
                    className={`
                      mx-3
                      mt-5
                      h-[2px]
                      flex-1
  
                      ${
                        completed
                          ? "bg-green-600"
                          : "bg-slate-300"
                      }
                    `}
  
                  />
  
                )}
  
              </div>
  
            );
  
          })}
  
        </div>
  
      </div>
  
    );
  
  }