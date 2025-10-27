import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCities } from "@/lib/cities";
import { useTranslation } from "@/lib/i18n";
import type { City } from "@shared/schema";

interface CitySelectProps {
  value: string;
  onChange: (value: string) => void;
  cityIds?: string[];
}

export function CitySelect({ value, onChange, cityIds }: CitySelectProps) {
  const { language, t: translations } = useTranslation();
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState<City[]>([]);

  useEffect(() => {
    getCities()
      .then((list) => {
        const active = list.filter((c) => c.isActive !== false);
        setCities(
          cityIds && cityIds.length > 0
            ? active.filter((c) => cityIds.includes(c.id))
            : active,
        );
      })
      .catch(() => {});
  }, [cityIds]);

  const selected = cities.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between"
        >
          {selected
            ? language === "ar"
              ? selected.nameAr
              : selected.nameEn
            : translations.city}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Command>
          <CommandInput placeholder={translations.search + "..."} />
          <CommandList>
            <CommandEmpty>No cities found.</CommandEmpty>
            <CommandGroup>
              {cities.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={(val) => {
                    onChange(val);
                    setOpen(false);
                  }}
                >
                  {language === "ar" ? c.nameAr : c.nameEn}
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      value === c.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
