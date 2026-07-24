"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus } from "lucide-react";

export const TEAM_OPTIONS = [
  { value: "Wireless technician", label: "Wireless technician" },
  { value: "Fiber technician", label: "Fiber technician" },
];

export function TechnicianCreateForm({
  name,
  onNameChange,
  title,
  onTitleChange,
  technicianLevel,
  onTechnicianLevelChange,
  phone,
  onPhoneChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  idNumber,
  onIdNumberChange,
  busy,
  onAdd,
}: {
  name: string;
  onNameChange: (value: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
  technicianLevel: "junior" | "senior";
  onTechnicianLevelChange: (value: "junior" | "senior") => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  idNumber: string;
  onIdNumberChange: (value: string) => void;
  busy: boolean;
  onAdd: () => void;
}) {
  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4" />
          Add technician
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Email + app password are the MEGS Field mobile login. Changing them here updates app
          sign-in immediately.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Full name"
        />
        <Select value={title} onValueChange={(v) => v && onTitleChange(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEAM_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={technicianLevel}
          onValueChange={(value) =>
            value && onTechnicianLevelChange(value as "junior" | "senior")
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="junior">Junior technician</SelectItem>
            <SelectItem value="senior">Senior technician</SelectItem>
          </SelectContent>
        </Select>
        <Input value={phone} onChange={(e) => onPhoneChange(e.target.value)} placeholder="Phone number" />
        <Input
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="App login email"
        />
        <Input
          type="text"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="App login password (min 8)"
          autoComplete="new-password"
        />
        <Input
          value={idNumber}
          onChange={(e) => onIdNumberChange(e.target.value)}
          placeholder="ID number"
        />
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={busy}
          onClick={onAdd}
        >
          Add
        </Button>
      </CardContent>
    </Card>
  );
}
