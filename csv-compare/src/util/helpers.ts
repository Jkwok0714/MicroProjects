export const camelCaseToSentenceCase = (input: string): string => {
  // Split camel case string into words
  const words = input.replace(/([a-z])([A-Z])/g, '$1 $2').split(/(?=[A-Z])/);

  // Capitalize the first word and make sure the rest are in lowercase
  const sentence = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return sentence;
};

export const slugify = (name: string): string => {
  return name.toLocaleLowerCase().replace(/\s/g, '-').replace(/[^\w]/gi, '');
};

export const isNumeric = (value: string): boolean => !isNaN(parseFloat(value));
