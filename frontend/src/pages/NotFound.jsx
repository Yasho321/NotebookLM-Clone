import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <p className="text-label mb-4" style={{ color: 'var(--accent)', fontSize: '11px' }}>
        PAGE NOT FOUND
      </p>
      <h1 className="text-foreground mb-6" style={{ fontSize: '64px', fontWeight: 'var(--font-weight-semibold)', letterSpacing: '-0.04em', lineHeight: '1' }}>
        404
      </h1>
      <p className="text-body text-muted-foreground mb-8 text-center max-w-md">
        The page you are looking for does not exist or has been moved.
      </p>
      <Button asChild size="lg" className="h-11 px-8 text-sm font-medium shadow-xs">
        <Link to="/">
          Return Home
        </Link>
      </Button>
    </div>
  );
};

export default NotFound;