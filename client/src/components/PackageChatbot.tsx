import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Bot, Send, User, Calculator, TrendingDown, TrendingUp, Package, ArrowLeft, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";

interface Message {
  role: "user" | "assistant";
  content: string;
  component?: React.ReactNode;
}

interface Option {
  label: string;
  value: string;
  price?: number;
  metadata?: any;
}

interface ClothingItem {
  id: string;
  name: string;
  description?: string;
}

interface LaundryService {
  id: string;
  name: string;
  description?: string;
  price: number;
}

interface PricingData {
  clothingItemId: string;
  clothingItemName: string;
  serviceId: string;
  serviceName: string;
  actualPrice: number;
  credits: number;
}

interface FinancialAnalysis {
  regularPrice: number;
  packagePrice: number;
  customerSavings: number;
  companyLoss: number;
  costPerCredit: number;
  breakEvenCredits: number;
}

type Step = "name" | "description" | "clothingItem" | "service" | "pricing" | "credits" | "analysis" | "confirmation" | "done";

interface PackageChatbotProps {
  open: boolean;
  onClose: () => void;
}

export function PackageChatbot({ open, onClose }: PackageChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [step, setStep] = useState<Step>("name");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Package data
  const [packageName, setPackageName] = useState("");
  const [packageNameAr, setPackageNameAr] = useState("");
  const [packageDescription, setPackageDescription] = useState("");
  const [packageDescriptionAr, setPackageDescriptionAr] = useState("");
  const [selectedClothingItem, setSelectedClothingItem] = useState<ClothingItem | null>(null);
  const [selectedService, setSelectedService] = useState<LaundryService | null>(null);
  const [actualPrice, setActualPrice] = useState(0);
  const [packagePrice, setPackagePrice] = useState(0);
  const [creditsToGive, setCreditsToGive] = useState(1);
  const [financialAnalysis, setFinancialAnalysis] = useState<FinancialAnalysis | null>(null);
  
  // Data stores
  const [clothingItems, setClothingItems] = useState<ClothingItem[]>([]);
  const [laundryServices, setLaundryServices] = useState<LaundryService[]>([]);
  
  const { toast } = useToast();
  const { branch } = useAuthContext();
  const [show, setShow] = useState(open);
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();

  // Utility function to parse bilingual input format "English//Arabic"
  const parseInlineBilingual = (input: string): { en: string; ar: string } => {
    if (input.includes('//')) {
      const [english, arabic] = input.split('//');
      return {
        en: english?.trim() || '',
        ar: arabic?.trim() || ''
      };
    }
    // If no "//" found, use input for English and leave Arabic empty
    return {
      en: input.trim(),
      ar: ''
    };
  };

  const steps: Step[] = ["name", "description", "clothingItem", "service", "pricing", "credits", "analysis", "confirmation", "done"];
  const stepTitles = {
    name: t.packageChatbot.steps.name,
    description: t.packageChatbot.steps.description,
    clothingItem: t.packageChatbot.steps.clothingItem,
    service: t.packageChatbot.steps.service,
    pricing: t.packageChatbot.steps.pricing,
    credits: t.packageChatbot.steps.credits,
    analysis: t.packageChatbot.steps.analysis,
    confirmation: t.packageChatbot.steps.confirmation,
    done: t.packageChatbot.steps.done
  };

  useEffect(() => {
    if (open) setShow(true);
  }, [open]);

  // Utility Functions
  const calculateFinancialAnalysis = (actualPrice: number, packagePrice: number, credits: number): FinancialAnalysis => {
    const regularPrice = actualPrice * credits; // What customer would normally pay
    const customerSavings = regularPrice - packagePrice; // Positive = savings, Negative = overpayment
    const companyRevenue = packagePrice - regularPrice; // How much extra company makes
    const costPerCredit = packagePrice / credits;
    const breakEvenCredits = Math.ceil(packagePrice / actualPrice);
    
    return {
      regularPrice,
      packagePrice,
      customerSavings,
      companyLoss: -companyRevenue, // Keep for compatibility but flip sign
      costPerCredit,
      breakEvenCredits
    };
  };


  const fetchActualPrice = async (clothingItemId: string, serviceId: string): Promise<number> => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/item-prices?clothingItemId=${clothingItemId}&serviceId=${serviceId}`,
        { credentials: "include" }
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch price");
      }
      
      const data = await response.json();
      return Number(data.price);
    } catch (error) {
      toast({ title: "Failed to fetch pricing data", variant: "destructive" });
      return 0;
    } finally {
      setLoading(false);
    }
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);

      // Load clothing items
      const clothingResponse = await fetch("/api/clothing-items", {
        credentials: "include"
      });
      
      let clothingData = [];
      if (clothingResponse.ok) {
        const result = await clothingResponse.json();
        clothingData = Array.isArray(result) ? result : (result.data || []);
        setClothingItems(clothingData);
      }

      // Load services
      const servicesResponse = await fetch("/api/laundry-services", {
        credentials: "include"
      });
      
      let servicesData = [];
      if (servicesResponse.ok) {
        const result = await servicesResponse.json();
        servicesData = Array.isArray(result) ? result : (result.data || []);
        setLaundryServices(servicesData);
      }

      // debug logs removed

      return { clothingData, servicesData };
      
    } catch (error) {
      toast({ title: "Failed to load data", variant: "destructive" });
      return { clothingData: [], servicesData: [] };
    } finally {
      setLoading(false);
    }
  };

  const addMessage = (role: "user" | "assistant", content: string, component?: React.ReactNode) => {
    setMessages(prev => [...prev, { role, content, component }]);
    // Auto-scroll to bottom after message is added
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const goToStep = (newStep: Step) => {
    const stepIndex = steps.indexOf(newStep);
    setStep(newStep);
    setCurrentStepIndex(stepIndex);
    // Only clear options for steps that don't need to preserve them
    if (!['clothingItem', 'service', 'analysis', 'confirmation', 'done'].includes(newStep)) {
      setOptions([]);
    }
    setInputValue("");
  };

  const goToNextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      goToStep(steps[nextIndex]);
    }
  };

  const goToPreviousStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      goToStep(steps[prevIndex]);
    }
  };

  const handleAnimationEnd = () => {
    if (!open) setShow(false);
  };

  // Step Handlers
  const handleStepResponse = async (response: string) => {
    addMessage("user", response);
    
    switch (step) {
      case "name":
        await handleNameStep(response);
        break;
      case "description":
        await handleDescriptionStep(response);
        break;
      case "clothingItem":
        // Handled by option click
        break;
      case "service":
        // Handled by option click
        break;
      case "pricing":
        await handlePricingStep(response);
        break;
      case "credits":
        await handleCreditsStep(response);
        break;
      case "analysis":
        // Handled by option click
        break;
      case "confirmation":
        await handleConfirmationStep();
        break;
    }
  };

  const handleNameStep = async (name: string) => {
    const parsedName = parseInlineBilingual(name);
    setPackageName(parsedName.en);
    setPackageNameAr(parsedName.ar);
    
    // Display the English name in the confirmation message
    const displayName = parsedName.en || name;
    addMessage("assistant", t.packageChatbot.goodPackageName.replace("{name}", displayName));
    goToNextStep();
  };

  const handleDescriptionStep = async (description: string) => {
    const parsedDescription = parseInlineBilingual(description);
    setPackageDescription(parsedDescription.en);
    setPackageDescriptionAr(parsedDescription.ar);
    addMessage("assistant", t.packageChatbot.selectClothingItem);
    
    let items = clothingItems;
    if (items.length === 0) {
      const data = await loadInitialData();
      items = data?.clothingData ?? [];
    }
    
    if (items.length === 0) {
      addMessage("assistant", t.packageChatbot.noClothingItems);
      return;
    }
    
    const clothingOptions: Option[] = items.map(item => ({
      label: item.name,
      value: item.id,
      metadata: item
    }));
    
    // debug logs removed
    
    // Move to next step first, then set options to avoid clearing
    goToNextStep();
    setOptions(clothingOptions);
  };

  const handleClothingItemSelection = async (option: Option) => {
    const clothingItem = option.metadata as ClothingItem;
    setSelectedClothingItem(clothingItem);
    addMessage("user", option.label);
    addMessage("assistant", t.packageChatbot.excellentChoice.replace("{item}", clothingItem.name));
    
    try {
      setLoading(true);
      // Use EXACT same strategy as POS system ServiceSelectionModal
      const params = new URLSearchParams();
      params.append("branchCode", branch?.code || "HAD");
      
      const res = await fetch(`/api/clothing-items/${clothingItem.id}/services?${params}`, {
        credentials: "include",
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        // swallow details but still throw
        console.error("Services API error");
        throw new Error(`Failed to fetch services: ${res.status} ${errorText}`);
      }
      
      const result = await res.json();
      // debug logs removed
      
      const servicesForItem = Array.isArray(result) ? result : (result.data || []);
      // debug logs removed
      
      if (!Array.isArray(servicesForItem)) {
        console.error("PackageChatbot services not array");
        throw new Error('Invalid services response format');
      }
      
      if (servicesForItem.length === 0) {
        // debug logs removed
        addMessage("assistant", t.packageChatbot.noServicesAvailable.replace("{item}", clothingItem.name));
        return;
      }
      
      addMessage("assistant", t.packageChatbot.selectService.replace("{item}", clothingItem.name));
      
      // debug logs removed
      
      const serviceOptions: Option[] = servicesForItem.map((service: LaundryService & { itemPrice?: string }) => {
        // Robust price coercion to avoid formatCurrency TypeError
        const raw = (service as any).itemPrice ?? (service as any).price;
        const price = typeof raw === 'string' ? parseFloat(raw) : Number(raw ?? 0);
        const safePrice = Number.isFinite(price) ? price : 0;
        
        return {
          label: `${service.name} - ${formatCurrency(safePrice)}`,
          value: service.id,
          price: safePrice,
          metadata: service
        };
      });
      
      // debug logs removed
      
      // Move to next step first, then set options to avoid clearing
      goToNextStep();
      setOptions(serviceOptions);
    } catch (error) {
      toast({ 
        title: "Failed to load services", 
        description: "Could not fetch services for this clothing item",
        variant: "destructive" 
      });
      addMessage("assistant", "Sorry, I couldn't load the services for this item. Please try selecting another clothing item.");
    } finally {
      setLoading(false);
    }
  };

  const handleServiceSelection = async (option: Option) => {
    const service = option.metadata as LaundryService;
    setSelectedService(service);
    addMessage("user", option.label);
    
    if (selectedClothingItem) {
      addMessage("assistant", "Fetching actual pricing data...", 
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          <span>Getting real-time pricing...</span>
        </div>
      );
      
      const actualPrice = await fetchActualPrice(selectedClothingItem.id, service.id);
      setActualPrice(actualPrice);
      
      addMessage("assistant", 
        t.packageChatbot.enterPackagePrice.replace("{price}", formatCurrency(actualPrice))
      );
      
      goToNextStep();
    }
  };

  const handlePricingStep = async (priceStr: string) => {
    const price = parseFloat(priceStr);
    
    if (isNaN(price) || price <= 0) {
      addMessage("assistant", t.packageChatbot.invalidPrice);
      return;
    }
    
    setPackagePrice(price);
    addMessage("assistant", t.packageChatbot.packagePriceSet.replace("{price}", formatCurrency(price)));
    goToNextStep();
  };

  const handleCreditsStep = async (creditsStr: string) => {
    const credits = parseInt(creditsStr);
    
    if (isNaN(credits) || credits <= 0) {
      addMessage("assistant", t.packageChatbot.invalidCredits);
      return;
    }
    
    setCreditsToGive(credits);
    
    // Calculate financial analysis
    const analysis = calculateFinancialAnalysis(actualPrice, packagePrice, credits);
    setFinancialAnalysis(analysis);
    
    addMessage("assistant", t.packageChatbot.financialAnalysis, 
      createFinancialAnalysisComponent(analysis)
    );
    
    setOptions([
      { label: t.packageChatbot.looksGoodContinue, value: "continue" },
      { label: t.packageChatbot.adjustPricing, value: "adjust-pricing" },
      { label: t.packageChatbot.adjustCredits, value: "adjust-credits" }
    ]);
    
    goToNextStep();
  };

  const handleConfirmationStep = async () => {
    if (!selectedClothingItem || !selectedService || !financialAnalysis) {
      toast({ title: "Missing package data", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      
      const payload = {
        nameEn: packageName,
        nameAr: packageNameAr,
        descriptionEn: packageDescription,
        descriptionAr: packageDescriptionAr,
        price: packagePrice.toString(), // Convert to string like Add Package form
        packageItems: [{
          clothingItemId: selectedClothingItem.id,
          serviceId: selectedService.id,
          credits: creditsToGive,
          paidCredits: creditsToGive
        }]
      };

      const response = await fetch("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Failed to create package");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/packages"] });
      
      addMessage("assistant", t.packageChatbot.packageCreated, 
        <div className="text-center p-4">
          <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="font-semibold text-green-700">Package "{packageName}" is now live!</p>
        </div>
      );

      setOptions([
        { label: "Create another package", value: "create-another" },
        { label: "Close assistant", value: "close" }
      ]);
      
      goToNextStep();
      
    } catch (error) {
      toast({ title: "Failed to create package", variant: "destructive" });
      addMessage("assistant", "Sorry, there was an error creating the package. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // UI Components
  const createFinancialAnalysisComponent = (analysis: FinancialAnalysis) => (
    <Card className="mt-3">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <Calculator className="h-4 w-4" />
          Financial Impact Analysis
        </div>
        
        <div className="space-y-3 text-sm">
          <div className="bg-gray-50 p-3 rounded-lg space-y-2">
            <div className="flex justify-between">
              <span>Work Value ({creditsToGive} uses):</span>
              <span className="font-medium">{formatCurrency(analysis.regularPrice)}</span>
            </div>
            <div className="flex justify-between">
              <span>Package Price:</span>
              <span className="font-medium text-blue-600">{formatCurrency(analysis.packagePrice)}</span>
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            {analysis.customerSavings >= 0 ? (
              <div className="flex justify-between">
                <span>💰 Customer Saves:</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(analysis.customerSavings)}
                </span>
              </div>
            ) : (
              <div className="flex justify-between">
                <span>⚠️ Customer Overpays:</span>
                <span className="font-medium text-red-600">
                  {formatCurrency(Math.abs(analysis.customerSavings))}
                </span>
              </div>
            )}
            
            <div className="flex justify-between">
              <span>{analysis.customerSavings >= 0 ? '📉 Company Revenue Loss:' : '📈 Company Extra Revenue:'}:</span>
              <span className={`font-medium ${analysis.customerSavings >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(Math.abs(analysis.customerSavings))}
              </span>
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Cost per Credit:</span>
              <span className="font-medium">{formatCurrency(analysis.costPerCredit)}</span>
            </div>
            <div className="flex justify-between">
              <span>Break-even at:</span>
              <Badge variant="outline">{analysis.breakEvenCredits} uses</Badge>
            </div>
          </div>
        </div>
        
        {analysis.customerSavings > 0 && (
          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
            ⚠️ This package offers significant customer savings. Consider if this aligns with your pricing strategy.
          </div>
        )}
      </CardContent>
    </Card>
  );

  const createProgressIndicator = () => {
    const progressPercentage = (currentStepIndex / (steps.length - 1)) * 100;
    
    return (
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">Step {currentStepIndex + 1} of {steps.length}</span>
          <span className="text-xs text-muted-foreground">{stepTitles[step]}</span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>
    );
  };

  // Option Click Handler
  const handleOptionClick = async (option: Option) => {
    switch (step) {
      case "clothingItem":
        await handleClothingItemSelection(option);
        break;
      case "service":
        await handleServiceSelection(option);
        break;
      case "analysis":
        if (option.value === "continue") {
          addMessage("user", "Looks good, let's proceed");
          addMessage("assistant", "Perfect! Here's your complete package summary:", createPackageSummary());
          setOptions([
            { label: "Create Package", value: "create" },
            { label: "Go back and adjust", value: "back" }
          ]);
          goToNextStep();
        } else if (option.value === "adjust-pricing") {
          addMessage("user", "I want to adjust the pricing");
          addMessage("assistant", "No problem! Enter the new package price (KWD):");
          goToStep("pricing");
        } else if (option.value === "adjust-credits") {
          addMessage("user", "I want to adjust the credit amount");
          addMessage("assistant", "Sure! Enter the new number of credits:");
          goToStep("credits");
        }
        break;
      case "confirmation":
        if (option.value === "create") {
          addMessage("user", "Create the package");
          await handleConfirmationStep();
        } else if (option.value === "back") {
          addMessage("user", "Let me make some adjustments");
          goToPreviousStep();
        }
        break;
      case "done":
        if (option.value === "create-another") {
          resetChatbot();
        } else if (option.value === "close") {
          onClose();
        }
        break;
    }
  };

  const createPackageSummary = () => (
    <Card className="mt-3">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <Package className="h-4 w-4" />
          Package Summary
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <span className="font-medium">Name:</span>
            <span>{packageName}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <span className="font-medium">Description:</span>
            <span>{packageDescription}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <span className="font-medium">Item:</span>
            <span>{selectedClothingItem?.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <span className="font-medium">Service:</span>
            <span>{selectedService?.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <span className="font-medium">Price:</span>
            <span className="text-blue-600 font-medium">{formatCurrency(packagePrice)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <span className="font-medium">Credits:</span>
            <Badge>{creditsToGive} uses</Badge>
          </div>
        </div>
        
        {financialAnalysis && (
          <div className="pt-2 border-t">
            <div className="text-xs text-muted-foreground">Financial Impact:</div>
            <div className="text-sm mt-1">
              Customer saves {formatCurrency(financialAnalysis.customerSavings)}, 
              Company {financialAnalysis.companyLoss > 0 ? 'loses' : 'gains'} {formatCurrency(Math.abs(financialAnalysis.companyLoss))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const resetChatbot = () => {
    setMessages([]);
    setOptions([]);
    setStep("name");
    setCurrentStepIndex(0);
    setInputValue("");
    setLoading(false);
    setPackageName("");
    setPackageDescription("");
    setSelectedClothingItem(null);
    setSelectedService(null);
    setActualPrice(0);
    setPackagePrice(0);
    setCreditsToGive(1);
    setFinancialAnalysis(null);
    
    // Start the flow
    addMessage("assistant", `${t.packageChatbot.welcome}\n\n${t.packageChatbot.askPackageName}`);
  };

  // Initialization
  useEffect(() => {
    if (open) {
      resetChatbot();
      void loadInitialData();
    }
  }, [open]);

  if (!show) return null;

  return (
    <div
      onAnimationEnd={handleAnimationEnd}
      className={`fixed bottom-4 right-4 z-50 flex w-full max-w-md flex-col rounded-lg border bg-background shadow-lg transition-all sm:max-w-lg ${
        open
          ? "animate-in fade-in slide-in-from-bottom-2 zoom-in-95"
          : "animate-out fade-out slide-out-to-bottom-2 zoom-out-95"
      }`}
    >
      {/* Enhanced Header with Progress */}
      <div className="flex items-center justify-between p-3 border-b bg-primary/5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-primary">{t.packageChatbot.title}</h4>
        </div>
        <button 
          type="button" 
          onClick={onClose} 
          className="text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-close"
        >
          ×
        </button>
      </div>

      {/* Progress Indicator */}
      {step !== "done" && (
        <div className="p-3 border-b bg-background">
          {createProgressIndicator()}
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 p-4">
        <div 
          className="min-h-[200px] max-h-[60vh] overflow-y-auto space-y-4 custom-scrollbar"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#cbd5e1 #f1f5f9'
          }}
        >
          {loading && messages.length === 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-sm">Initializing assistant...</span>
            </div>
          )}
          
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 ${
                m.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {m.role === "assistant" && (
                <Avatar className="h-6 w-6 flex-shrink-0">
                  <AvatarFallback>
                    <Bot className="h-3 w-3" />
                  </AvatarFallback>
                </Avatar>
              )}
              
              <div className={`max-w-[80%] ${m.role === "user" ? "order-2" : "order-1"}`}>
                {/* Message Content */}
                <div
                  className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user" 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted"
                  }`}
                >
                  {m.content}
                </div>
                
                {/* Component Content */}
                {m.component && (
                  <div className="mt-2">
                    {m.component}
                  </div>
                )}
              </div>

              {m.role === "user" && (
                <Avatar className="h-6 w-6 flex-shrink-0 order-1">
                  <AvatarFallback>
                    <User className="h-3 w-3" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          
          {loading && messages.length > 0 && (
            <div className="flex items-start gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback>
                  <Bot className="h-3 w-3" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-muted rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                  <span className="text-xs text-muted-foreground">Processing...</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Auto-scroll reference */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Navigation Buttons */}
      {currentStepIndex > 0 && step !== "done" && (
        <div className="px-4 pb-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={goToPreviousStep}
            className="text-xs"
            data-testid="button-previous"
          >
            <ArrowLeft className="h-3 w-3 mr-1" />
            Previous Step
          </Button>
        </div>
      )}

      {/* Options */}
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 border-t bg-muted/30">
          {options.map((o) => (
            <Button 
              key={o.value} 
              size="sm" 
              variant={o.value === "create" ? "default" : "outline"}
              onClick={() => void handleOptionClick(o)}
              disabled={loading}
              className="text-xs"
              data-testid={`button-${o.value}`}
            >
              {o.label}
              {o.price && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {formatCurrency(o.price)}
                </Badge>
              )}
            </Button>
          ))}
        </div>
      )}

      {/* Text Input */}
      {(step === "name" || step === "description" || step === "pricing" || step === "credits") && (
        <div className="flex items-end gap-2 p-3 border-t">
          {step === "credits" && (
            <div className="flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPreviousStep}
                data-testid="button-adjust-pricing"
              >
                <Calculator className="h-3 w-3" />
              </Button>
            </div>
          )}
          
          <Textarea
            className="flex-1 min-h-[40px] resize-none text-sm"
            placeholder={
              step === "name" ? "Enter package name..." :
              step === "description" ? "Describe this package..." :
              step === "pricing" ? "Enter price in KWD (e.g., 5.500)" :
              step === "credits" ? "Enter number of credits (e.g., 5)" :
              "Type your response..."
            }
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (inputValue.trim()) {
                  void handleStepResponse(inputValue.trim());
                }
              }
            }}
            disabled={loading}
            data-testid="input-response"
          />
          
          <Button 
            size="icon" 
            onClick={() => inputValue.trim() && void handleStepResponse(inputValue.trim())} 
            disabled={!inputValue.trim() || loading}
            data-testid="button-send"
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Submit</span>
          </Button>
        </div>
      )}
    </div>
  );
}

export default PackageChatbot;
