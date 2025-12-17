interface PasswordStrengthProps {
  password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const getStrength = (pwd: string): { level: 0 | 1 | 2 | 3 | 4; label: string; color: string } => {
    let level: 0 | 1 | 2 | 3 | 4 = 0;

    if (pwd.length >= 8) level++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) level++;
    if (/\d/.test(pwd)) level++;
    if (/[^a-zA-Z\d]/.test(pwd)) level++;

    const strengths = [
      { label: 'Very Weak', color: 'bg-red-500' },
      { label: 'Weak', color: 'bg-orange-500' },
      { label: 'Fair', color: 'bg-yellow-500' },
      { label: 'Good', color: 'bg-blue-500' },
      { label: 'Strong', color: 'bg-green-500' }
    ];

    return {
      level,
      ...strengths[level]
    };
  };

  if (!password) return null;

  const { level, label, color } = getStrength(password);

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= level ? color : 'bg-gray-200'} transition-colors`}
          />
        ))}
      </div>
      <p className="text-xs text-gray-600">
        Strength: <span className="font-medium">{label}</span>
      </p>
    </div>
  );
}
