function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{title}</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>
    </div>
  );
}

export default PageHeader;
