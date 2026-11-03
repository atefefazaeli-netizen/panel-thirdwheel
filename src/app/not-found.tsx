import { Link } from '@tanstack/react-router';
import { CompassIcon } from 'lucide-react';
import { EmptyState } from '@/components/shared';
import { Button } from '@/components/ui/button';

export function NotFound() {
  return (
    <div className="p-6">
      <EmptyState
        icon={CompassIcon}
        title="Page not found"
        description="This address does not match a page in the panel."
        action={
          <Button asChild variant="outline">
            <Link to="/">Go to the dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
