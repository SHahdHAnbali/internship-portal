function Footer() {
    return (
      <footer className="border-t bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold">
                Internship Portal
              </h3>
  
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Connecting talented students with meaningful
                internship opportunities.
              </p>
            </div>
  
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Internship Portal.
              All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    );
  }
  
  export default Footer;