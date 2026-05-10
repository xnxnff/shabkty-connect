import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Ad = {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  link_url: string | null;
};

export function AdPopup() {
  const [ad, setAd] = useState<Ad | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const seen = sessionStorage.getItem("ad-seen");
      if (seen) return;
      const { data } = await supabase
        .from("popup_ads")
        .select("id,title,body,image_url,link_url")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data[0]) {
        setAd(data[0]);
        setTimeout(() => setOpen(true), 800);
        sessionStorage.setItem("ad-seen", "1");
      }
    })();
  }, []);

  if (!ad) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-border/60 bg-card">
        <DialogHeader>
          <DialogTitle className="text-gradient text-xl">{ad.title}</DialogTitle>
          {ad.body && <DialogDescription className="text-muted-foreground">{ad.body}</DialogDescription>}
        </DialogHeader>
        {ad.image_url && (
          <img src={ad.image_url} alt={ad.title} className="rounded-xl w-full max-h-72 object-cover" />
        )}
        {ad.link_url && (
          <Button asChild className="gradient-primary">
            <a href={ad.link_url} target="_blank" rel="noreferrer">عرض التفاصيل</a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
