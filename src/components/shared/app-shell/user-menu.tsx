import { Link } from '@tanstack/react-router';
import { LogOutIcon, UserRoundCogIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { initials } from '@/lib/format';
import type { StaffMe } from '@/stores/session';

export interface UserMenuProps {
  staff: StaffMe;
  onSignOut: () => void;
}

/** Role keys as words for the menu (display only; nothing is decided on them). */
const roleLabel = (key: string) => key.replace(/_/g, ' ');

export function UserMenu({ staff, onSignOut }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-2 px-1.5" aria-label={`Account: ${staff.displayName}`}>
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {initials(staff.displayName || staff.username)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm font-medium lg:inline">{staff.displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1.5">
          <span className="truncate text-sm">{staff.displayName}</span>
          <span className="truncate font-mono text-xs font-normal text-muted-foreground">{staff.username}</span>
          <span className="flex flex-wrap gap-1">
            {staff.roles.map((r) => (
              <Badge key={r} variant="secondary" className="capitalize">
                {roleLabel(r)}
              </Badge>
            ))}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/account">
              <UserRoundCogIcon />
              My account
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onSignOut}>
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
